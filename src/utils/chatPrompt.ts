import * as vscode from "vscode";
import { SkillMeta } from "../types";
import { WorkspaceProfile } from "../services/WorkspaceAnalyzer";
import { DiscoveryPromptSection } from "../services/discoveryPrompt";

const COMMAND_CANDIDATES = [
  "composer.startComposerPrompt",
  "cursor.chat.open",
  "workbench.action.chat.open",
  "workbench.action.quickchat.toggle"
];

/**
 * Cursor's prompt deeplink (`cursor://anysphere.cursor-deeplink/prompt?text=...`)
 * is the only reliable way to pre-fill the chat composer; the `executeCommand`
 * approach opens an empty chat in current Cursor builds. URL-encoded budget is
 * ~8000 chars; we leave headroom so the fallback notice still fits.
 */
const CURSOR_DEEPLINK_BUDGET = 7500;
const CURSOR_DEEPLINK_PREFIX = "cursor://anysphere.cursor-deeplink/prompt?text=";

const MAX_SKILL_LINES = 80;
const MAX_DEPS = 30;
const MAX_LANGUAGES = 15;
const MAX_PATHS = 20;
const MAX_DESCRIPTION = 160;
const MAX_KEYWORDS = 6;

/**
 * Fallback used only when no catalog is available; replaced by `buildAskAgentPrompt`
 * once a sync has populated the workspace cache.
 */
export const SKILL_RECOMMENDER_CHAT_PROMPT =
  "Recommend Cursor agent skills for this workspace using the Agent Skill Sync skill-recommender subagent. Read `.cursor/skill-sync/catalog.json` if present, `.cursor/skills/` for already-installed packages, and stack files (package.json, AGENTS.md, etc.). Output grouped suggestions only — do not edit files.";

function truncate(value: string, max: number): string {
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, max).trimEnd()}…`;
}

function formatSkillLine(meta: SkillMeta): string {
  const kind = meta.skillType === "cursor-rule" ? "rule" : "skill";
  const category = meta.category ? ` [${meta.category}]` : "";
  const description = meta.description
    ? ` — ${truncate(meta.description.replace(/\s+/g, " ").trim(), MAX_DESCRIPTION)}`
    : "";

  const triggerBits: string[] = [];
  const trig = meta.triggers;
  if (trig?.languages?.length) {
    triggerBits.push(`langs: ${trig.languages.slice(0, 6).join(", ")}`);
  }
  if (trig?.dependencies?.length) {
    triggerBits.push(`deps: ${trig.dependencies.slice(0, 6).join(", ")}`);
  }
  if (trig?.files?.length) {
    triggerBits.push(`files: ${trig.files.slice(0, 4).join(", ")}`);
  }
  if (trig?.keywords?.length) {
    triggerBits.push(`keywords: ${trig.keywords.slice(0, MAX_KEYWORDS).join(", ")}`);
  }
  if (trig?.generalPurpose) {
    triggerBits.push("generalPurpose");
  }
  const triggers = triggerBits.length ? ` (${triggerBits.join("; ")})` : "";
  return `- **${meta.name}** (${kind})${category}${description}${triggers}`;
}

/**
 * Build a single self-contained prompt that the user can submit (or tweak) in chat.
 * It bakes in the workspace fingerprint and the available catalog so the agent has
 * full context without needing to read additional files.
 */
export function buildAskAgentPrompt(
  profile: WorkspaceProfile,
  catalogMetas: SkillMeta[],
  optedInSkillNames: string[],
  discoverySections: DiscoveryPromptSection[] = []
): string {
  const opted = new Set(optedInSkillNames.map((n) => n.toLowerCase()));
  const candidates = catalogMetas.filter((m) => !opted.has(m.name.toLowerCase()));
  const installed = catalogMetas.filter((m) => opted.has(m.name.toLowerCase()));

  const languages = [...profile.languages].sort();
  const dependencies = [...profile.dependencies].sort();
  const paths = [...profile.relativePaths].sort();

  const languagesLine = languages.length
    ? languages.slice(0, MAX_LANGUAGES).join(", ") +
      (languages.length > MAX_LANGUAGES ? ` (+${languages.length - MAX_LANGUAGES} more)` : "")
    : "(none detected)";
  const depsLine = dependencies.length
    ? dependencies.slice(0, MAX_DEPS).join(", ") +
      (dependencies.length > MAX_DEPS ? ` (+${dependencies.length - MAX_DEPS} more)` : "")
    : "(none detected)";
  const pathsLine = paths.length
    ? paths.slice(0, MAX_PATHS).join(", ")
    : "(none sampled)";

  const candidateLines = candidates.slice(0, MAX_SKILL_LINES).map(formatSkillLine);
  const candidateOverflow =
    candidates.length > MAX_SKILL_LINES
      ? `\n- …and ${candidates.length - MAX_SKILL_LINES} more not shown.`
      : "";

  const installedSection = installed.length
    ? `Already enabled in this workspace (skip these unless I ask for an audit):\n${installed
        .map((m) => `- ${m.name}`)
        .join("\n")}\n\n`
    : "";

  const candidateSection = candidateLines.length
    ? `Catalog candidates (${candidates.length} total${candidates.length > MAX_SKILL_LINES ? `, top ${MAX_SKILL_LINES} shown` : ""}):
${candidateLines.join("\n")}${candidateOverflow}`
    : "Catalog candidates: (none — try syncing first via `Skill Sync: Manage AI Skills`).";

  const discoverySection =
    discoverySections.length > 0
      ? `\n\nDiscovery directories (public repos to mine for skills — for each one, **enumerate every skill in the repo** before recommending):\n${discoverySections
          .map((s) => `- **${s.source.label}** — ${s.repoUrl}\n  ${s.structureHint}`)
          .join("\n")}

For every discovery directory above, before you respond:
1. List **every** skill that exists in the repo (use available tools — GitHub API / file listing / web fetch — to enumerate the directory; do not rely on memory of a single popular skill).
2. Evaluate **each** discovered skill against the workspace fingerprint (languages, dependencies, paths, AGENTS.md).
3. Include **all** that are a plausible fit (Strong, Other, or General-purpose), not just the single most obvious one.
4. For each discovery skill, note the GitHub coordinates inline as \`installSource.value = "owner/repo"\` and \`skillPath = "..."\` so the user can install it.`
      : "";

  return `Use the Agent Skill Sync **skill-recommender** subagent (\`agents/skill-recommender.md\`) to pick the best Cursor agent skills for this workspace. Recommend only — do not edit files.

Workspace fingerprint
- Languages: ${languagesLine}
- Dependencies: ${depsLine}
- Monorepo: ${profile.isMonorepo ? "yes" : "no"}
- Notable paths: ${pathsLine}
- AGENTS.md present: ${profile.agentsMdText ? "yes" : "no"}

${installedSection}${candidateSection}${discoverySection}

Please respond in three sections — **Strong matches**, **Other suggestions**, **General-purpose** — using one bullet per skill in the form \`**skill-name** — one sentence why\`. Combine catalog candidates with **all relevant discovery skills you enumerated above** — do not stop at one or two from each discovery repo if more fit the fingerprint. End with one line telling me to run **Skill Sync: Manage AI Skills** (\`skillSync.manageSkills\`) to enable the picks.`;
}

export async function resolveChatPromptCommand(): Promise<string | undefined> {
  try {
    const cmds = await vscode.commands.getCommands(true);
    for (const c of COMMAND_CANDIDATES) {
      if (cmds.includes(c)) {
        return c;
      }
    }
    return cmds.find((c) => /composer|aichat|quickchat/i.test(c));
  } catch {
    return undefined;
  }
}

function isCursorHost(): boolean {
  const scheme = (vscode.env.uriScheme ?? "").toLowerCase();
  const appName = (vscode.env.appName ?? "").toLowerCase();
  return scheme === "cursor" || appName.includes("cursor");
}

function trimToDeeplinkBudget(prompt: string, budget: number): string {
  if (encodeURIComponent(prompt).length <= budget) {
    return prompt;
  }
  let candidate = prompt;
  while (encodeURIComponent(candidate).length > budget && candidate.length > 0) {
    const cut = candidate.lastIndexOf("\n", candidate.length - 50);
    if (cut <= 0) {
      const ratio = budget / encodeURIComponent(candidate).length;
      candidate = candidate.slice(0, Math.max(0, Math.floor(candidate.length * ratio) - 50));
      break;
    }
    candidate = candidate.slice(0, cut);
  }
  return `${candidate}\n\n…(catalog list truncated to fit Cursor's deeplink limit — full prompt is on your clipboard)`;
}

export interface SeedChatResult {
  /** Chat surface was opened with the prompt visible to the user. */
  opened: boolean;
  /** True if the Cursor deeplink path was used (prompt pre-filled in composer). */
  viaDeeplink: boolean;
}

/**
 * Seed the chat composer with the supplied prompt. Cursor only accepts a
 * pre-filled prompt via its `cursor://anysphere.cursor-deeplink/prompt` URL,
 * so we prefer that when running inside Cursor; we always copy the full prompt
 * to the clipboard as a fallback regardless of which path runs.
 */
export async function seedChatWithPrompt(prompt: string): Promise<SeedChatResult> {
  await vscode.env.clipboard.writeText(prompt);

  if (isCursorHost()) {
    const trimmed = trimToDeeplinkBudget(prompt, CURSOR_DEEPLINK_BUDGET);
    const uri = vscode.Uri.parse(`${CURSOR_DEEPLINK_PREFIX}${encodeURIComponent(trimmed)}`);
    try {
      const ok = await vscode.env.openExternal(uri);
      if (ok) {
        return { opened: true, viaDeeplink: true };
      }
    } catch {
      // fall through to command-based attempts
    }
  }

  const id = await resolveChatPromptCommand();
  if (id) {
    try {
      await vscode.commands.executeCommand(id, prompt);
      return { opened: true, viaDeeplink: false };
    } catch {
      try {
        await vscode.commands.executeCommand(id, { query: prompt });
        return { opened: true, viaDeeplink: false };
      } catch {
        // ignore
      }
    }
  }

  return { opened: false, viaDeeplink: false };
}
