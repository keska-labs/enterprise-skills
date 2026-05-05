import { SkillMeta } from "../../types";
import { WorkspaceProfile } from "../WorkspaceAnalyzer";

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
 * Single user message for chat-completion APIs ranking catalog skills for a workspace.
 */
export function buildRecommendationPrompt(
  profile: WorkspaceProfile,
  catalogMetas: SkillMeta[],
  optedInSkillNames: string[]
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

  return `You are ranking Cursor agent skills for a software workspace. Each skill may be a "skill" package (directory with SKILL.md) or a "cursor-rule" (single rule file).

Workspace summary:
- Languages (from file extensions): ${languages}
- Dependencies (package managers): ${deps}
- Monorepo heuristic: ${profile.isMonorepo ? "yes" : "no"}
- Sample repo-relative paths:
${paths}

AGENTS.md excerpt (lowercase, may be empty):
${agents}

Catalog candidates (${candidates.length} total; ${Math.min(candidates.length, MAX_SKILL_LINES)} shown — only recommend names from this list):
${skillLines.join("\n")}

Task: Pick up to 20 skills that best help an AI coding agent working in this repo. Prefer strong alignment with languages, dependencies, file patterns, and AGENTS.md keywords. Use "general" matchKind sparingly for broadly useful skills.

Respond with ONLY valid JSON (no markdown fences) in this exact shape:
{"recommendations":[{"name":"<exact skill name from catalog>","score":0,"reason":"<one short sentence>","matchKind":"strong"}]}
- score: integer 0-100
- matchKind: one of "strong", "weak", "general"
- Omit opted-in skills (already installed list provided implicitly by exclusion — do not recommend duplicates.)
- Only use skill names that appear in the catalog lines above.`;

}
