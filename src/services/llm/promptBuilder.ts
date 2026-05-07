import { SkillMeta } from "../../types";
import { WorkspaceProfile } from "../WorkspaceAnalyzer";
import { DiscoveryPromptSection } from "../discoveryPrompt";

const MAX_AGENTS_SNIPPET = 2048;
const MAX_SKILL_LINES = 80;
const MAX_DEPS = 30;
const MAX_PATHS = 30;

function truncate(s: string, max: number): string {
  if (s.length <= max) {
    return s;
  }
  return `${s.slice(0, max)}…`;
}

/**
 * Prepended only when ranking runs through the Cursor SDK agent (`CursorSdkProvider`).
 * Encourages streamed narration so the Skill Manager transcript stays informative.
 * Not used for OpenAI/Anthropic/vscode.lm or for the "Ask the Agent" chat seed (`buildAskAgentPrompt`).
 */
export function wrapPromptForCursorSdkAgentRanking(taskPrompt: string): string {
  return `[Skill Manager — streaming]
The Recommended tab shows your streamed assistant text, thinking, and tool steps. While you work, briefly narrate meaningful progress (e.g. which discovery repo you are weighing, which workspace signals matter, what you are about to search or read)—one short sentence per distinct step is enough; avoid repeating yourself when nothing new happened.

When you are ready to return rankings, your **final** message body must be **only** the JSON object described in the task below (no markdown code fences, no prose before or after that JSON).

---

${taskPrompt}`;
}

/**
 * Single user message for chat-completion APIs ranking catalog skills for a workspace.
 */
export function buildRecommendationPrompt(
  profile: WorkspaceProfile,
  catalogMetas: SkillMeta[],
  optedInSkillNames: string[],
  discoverySections: DiscoveryPromptSection[] = []
): string {
  const opted = new Set(optedInSkillNames.map((n) => n.toLowerCase()));
  const candidates = catalogMetas.filter((m) => !opted.has(m.name.toLowerCase()));

  const languages = [...profile.languages].sort().join(", ") || "(none detected)";
  const deps = [...profile.dependencies].sort().slice(0, MAX_DEPS).join(", ") || "(none detected)";
  const paths = [...profile.relativePaths].sort().slice(0, MAX_PATHS).join("\n") || "(none sampled)";
  const agents = profile.agentsMdText
    ? truncate(profile.agentsMdText, MAX_AGENTS_SNIPPET)
    : "(no AGENTS.md excerpt)";

  const skillLines = candidates.slice(0, MAX_SKILL_LINES).map((m) => {
    const trig = m.triggers;
    const parts = [
      m.name,
      m.source?.label ?? "",
      m.category ?? "",
      truncate(m.description ?? "", 200),
      trig
        ? JSON.stringify({
            languages: trig.languages,
            dependencies: trig.dependencies,
            files: trig.files,
            keywords: trig.keywords?.slice(0, 8),
            generalPurpose: trig.generalPurpose
          })
        : "{}"
    ];
    return parts.join(" | ");
  });

  const discoveryKeysHint =
    discoverySections.length > 0
      ? discoverySections.map((s) => `- ${s.source.sourceKey} (${s.source.label})`).join("\n")
      : "";

  const discoveryBlocks =
    discoverySections.length > 0
      ? discoverySections
          .map(
            (s) =>
              `- ${s.source.label} — ${s.repoUrl}
  sourceKey: ${s.source.sourceKey}
  layout: ${s.structureHint}`
          )
          .join("\n")
      : "";

  const catalogSection =
    skillLines.length > 0
      ? `Prefetched catalog candidates (${candidates.length} total; ${Math.min(candidates.length, MAX_SKILL_LINES)} shown — recommend using these **exact** names when they fit).
Each line is: name | source-label | category | description | triggers JSON
${skillLines.join("\n")}`
      : `Prefetched catalog candidates: **none** (no GitHub/registry skills cached yet — you may still recommend from the discovery directories below using your own knowledge of those public repos).`;

  return `You are ranking Cursor agent skills for a software workspace. Each skill may be a "skill" package (directory with SKILL.md) or a "cursor-rule" (single rule file).

Workspace summary:
- Languages (from file extensions): ${languages}
- Dependencies (package managers): ${deps}
- Monorepo heuristic: ${profile.isMonorepo ? "yes" : "no"}
- Sample repo-relative paths:
${paths}

AGENTS.md excerpt (lowercase, may be empty):
${agents}

${catalogSection}

${
  discoverySections.length > 0
    ? `Discovery directories (public GitHub repos — **no precomputed catalog** here; use your training knowledge of those repos, or browse them with available tools if your runtime provides them):
${discoveryBlocks}

For each discovery directory:
1. **Enumerate every skill you know** is published in that repo (don't stop at the most obvious one — list each \`SKILL.md\` package / rule you can recall).
2. Evaluate **each** against the workspace fingerprint above (languages, dependencies, paths, AGENTS.md keywords).
3. Include **every plausibly-fitting** skill in your output, not just the single best match.
4. Skip skills you are not reasonably confident exist in the named repo — do not invent names.

When you recommend a skill from a discovery directory (i.e. it is **not** in the prefetched catalog list above), each item MUST include JSON fields:
- "installSource": { "value": "owner/repo", "skillPath": "optional path inside the repo, e.g. skills/foo" }
- "discoverySourceKey": one of:
${discoveryKeysHint}
If only one discovery directory is configured, you may omit "discoverySourceKey" and it will be inferred.
`
    : ""
}
Task: Pick up to 20 skills that best help an AI coding agent working in this repo. Prefer strong alignment with languages, dependencies, file patterns, and AGENTS.md keywords. Use "general" matchKind sparingly for broadly useful skills.

Respond with ONLY valid JSON (no markdown fences) in this exact shape:
{"recommendations":[{"name":"<skill name>","score":0,"reason":"<one short sentence>","matchKind":"strong"}]}
${
  discoverySections.length > 0
    ? `For skills taken from a discovery directory, each item MUST also include:
,"installSource":{"value":"owner/repo","skillPath":"optional/subdir"},"discoverySourceKey":"<one of the keys above>"

`
    : ""
}Rules:
- score: integer 0-100
- matchKind: one of "strong", "weak", "general"${
    discoverySections.length > 0
      ? `
- For catalog skills (listed in prefetched lines), omit installSource and discoverySourceKey; use the exact "name" from that list.
- installSource.value must look like a GitHub "owner/repo".`
      : ""
  }
- Omit opted-in skills (already installed — excluded above).`;
}
