import { SkillMeta } from "../types";
import { Recommendation, SkillInfo } from "../../webview-ui/types/messages";
import { WorkspaceProfile } from "./WorkspaceAnalyzer";

const STRONG_STEP = 25;
const STRONG_CAP = 75;
const WEAK_STEP = 10;
const WEAK_CAP = 30;
const GENERAL_BASELINE = 15;
const MIN_SCORE = 15;
const MAX_RESULTS = 20;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Glob-like match: `*` and `?` supported; comparison is case-insensitive. */
export function globMatchesPattern(pattern: string, relativePathLower: string, basenameLower: string): boolean {
  const pat = pattern.trim().toLowerCase().replace(/\\/g, "/");
  if (!pat) {
    return false;
  }
  if (pat.includes("/")) {
    if (relativePathLower === pat || relativePathLower.endsWith(`/${pat}`)) {
      return true;
    }
  } else if (basenameLower === pat) {
    return true;
  }
  const regex = new RegExp(
    `^${escapeRegex(pat).replace(/\\\*/g, ".*").replace(/\\\?/g, ".")}$`,
    "i"
  );
  return regex.test(basenameLower) || regex.test(relativePathLower);
}

export function skillMetaToSkillInfo(meta: SkillMeta): SkillInfo {
  return {
    name: meta.name,
    description: meta.description ?? "",
    version: meta.version ?? meta.shaOrVersion.slice(0, 7),
    category: meta.category ?? "",
    skillType: meta.skillType,
    fileCount: meta.skillFiles?.length
  };
}

function tokenize(text: string): Set<string> {
  const words = text.toLowerCase().split(/[^a-z0-9@/+.-]+/).filter((w) => w.length >= 2);
  return new Set(words);
}

function agentsHaystack(profile: WorkspaceProfile): string {
  return profile.agentsMdText ?? "";
}

function heuristicWeakHits(meta: SkillMeta, profile: WorkspaceProfile): number {
  const hay = agentsHaystack(profile);
  if (!hay) {
    return 0;
  }
  const parts = [meta.name, meta.description ?? "", meta.category ?? ""].join(" ");
  const tokens = tokenize(parts);
  let hits = 0;
  for (const t of tokens) {
    if (t.length < 3) {
      continue;
    }
    if (hay.includes(t)) {
      hits++;
    }
  }
  return hits;
}

function dependencyTokens(profile: WorkspaceProfile): Set<string> {
  const out = new Set<string>();
  for (const dep of profile.dependencies) {
    out.add(dep);
    const scopeStrip = dep.replace(/^@[^/]+\//, "");
    out.add(scopeStrip);
  }
  return out;
}

function heuristicDepLanguageHits(meta: SkillMeta, profile: WorkspaceProfile): number {
  const blob = [meta.name, meta.description ?? "", meta.category ?? ""].join(" ").toLowerCase();
  let hits = 0;
  for (const lang of profile.languages) {
    if (lang.length >= 2 && blob.includes(lang)) {
      hits++;
    }
  }
  const depTok = dependencyTokens(profile);
  for (const dep of depTok) {
    if (dep.length >= 3 && blob.includes(dep)) {
      hits++;
    }
  }
  return hits;
}

/**
 * Rank catalog skills for the workspace using declared triggers and lightweight heuristics.
 */
export function recommend(profile: WorkspaceProfile, metas: SkillMeta[], optedInSkills: string[]): Recommendation[] {
  const opted = new Set(optedInSkills);
  const agentsLower = agentsHaystack(profile);
  const results: Recommendation[] = [];

  for (const meta of metas) {
    if (opted.has(meta.name)) {
      continue;
    }

    const reasons: string[] = [];
    let strong = 0;
    let weak = 0;
    let hadStrongCategory = false;
    const t = meta.triggers;

    if (t?.languages?.length) {
      const matched = t.languages.filter((lang) => profile.languages.has(lang.toLowerCase()));
      if (matched.length > 0) {
        strong += STRONG_STEP;
        hadStrongCategory = true;
        reasons.push(`Matches workspace languages (${matched.slice(0, 3).join(", ")})`);
      }
    }

    if (t?.dependencies?.length) {
      const matched = t.dependencies.filter((d) => profile.dependencies.has(d.toLowerCase()));
      if (matched.length > 0) {
        strong += STRONG_STEP;
        hadStrongCategory = true;
        reasons.push(`Detected dependencies: ${matched.slice(0, 4).join(", ")}`);
      }
    }

    if (t?.extensions?.length) {
      const matched = t.extensions.filter((id) => profile.installedExtensions.has(id.toLowerCase()));
      if (matched.length > 0) {
        strong += STRONG_STEP;
        hadStrongCategory = true;
        reasons.push(`Matches installed extensions (${matched.slice(0, 2).join(", ")})`);
      }
    }

    if (t?.files?.length) {
      let fileHit = false;
      for (const pattern of t.files) {
        for (const rel of profile.relativePaths) {
          const base = rel.split("/").pop() ?? rel;
          if (globMatchesPattern(pattern, rel, base)) {
            fileHit = true;
            reasons.push(`Matched workspace file pattern “${pattern}”`);
            break;
          }
        }
        if (fileHit) {
          break;
        }
      }
      if (fileHit) {
        strong += STRONG_STEP;
        hadStrongCategory = true;
      }
    }

    if (t?.keywords?.length && agentsLower) {
      const matched = t.keywords.filter((kw) => kw.length > 0 && agentsLower.includes(kw.toLowerCase()));
      if (matched.length > 0) {
        // Declared keyword triggers must clear the minimum score alone (weak bucket is normally +10).
        weak += 15;
        reasons.push(`Keywords matched AGENTS.md (${matched.slice(0, 3).join(", ")})`);
      }
    }

    const weakFromHeuristicAgents = !t?.keywords?.length && agentsLower ? heuristicWeakHits(meta, profile) : 0;
    if (weakFromHeuristicAgents > 0) {
      weak += WEAK_STEP;
      reasons.push("Overlap with AGENTS.md text");
    }

    const weakFromDepsLang =
      !t?.languages?.length && !t?.dependencies?.length ? heuristicDepLanguageHits(meta, profile) : 0;
    if (weakFromDepsLang > 0 && weak < WEAK_CAP) {
      weak += WEAK_STEP;
      reasons.push("Related to detected stack or dependencies");
    }

    strong = Math.min(strong, STRONG_CAP);
    weak = Math.min(weak, WEAK_CAP);

    let baseline = 0;
    if (t?.generalPurpose === true && strong === 0) {
      baseline = GENERAL_BASELINE;
      reasons.push("General-purpose recommendation");
    }

    const score = Math.min(100, strong + weak + baseline);

    if (score < MIN_SCORE) {
      continue;
    }

    let matchKind: Recommendation["matchKind"];
    const generalOnly = t?.generalPurpose === true && strong === 0 && weak === 0 && baseline > 0;
    if (generalOnly) {
      matchKind = "general";
    } else if (score >= 50 || hadStrongCategory) {
      matchKind = "strong";
    } else {
      matchKind = "weak";
    }

    results.push({
      skill: skillMetaToSkillInfo(meta),
      score,
      reasons: reasons.length > 0 ? reasons : ["Suggested for this workspace"],
      matchKind
    });
  }

  results.sort((a, b) => b.score - a.score || a.skill.name.localeCompare(b.skill.name));
  return results.slice(0, MAX_RESULTS);
}
