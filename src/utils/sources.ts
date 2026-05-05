import { ResolvedSource, SourceConfig, SourceMode, SourceType } from "../types";

const COMPOSITE_SEP = "/";

/**
 * Derive a short, stable label for a source when the user has not supplied one.
 *
 * Github: `owner/repo` → `repo` (the final segment).
 * Custom registry: URL → hostname.
 *
 * Falls back to a normalized version of the raw value if parsing fails so the
 * label is never empty and always safe to use as a workspace folder name.
 */
export function deriveSourceLabel(source: SourceConfig): string {
  if (typeof source.label === "string" && source.label.trim().length > 0) {
    return sanitizeSourceLabel(source.label);
  }

  if (source.type === "github-repo") {
    // Default to `owner/repo` so two `awesome-skills` repos from different
    // owners can coexist. `/` is preserved by `sanitizeSourceLabel` so the
    // label reads naturally in the UI and creates a nested folder under
    // `.cursor/rules/<owner>/<repo>/`. Users can still pass `label` to override.
    const value = source.value.trim();
    const ssh = value.match(/[:/]([^/\s:]+)\/([^/\s]+?)(?:\.git)?$/);
    if (ssh) {
      return sanitizeSourceLabel(`${ssh[1]}/${ssh[2]}`);
    }
    const parts = value.split("/").filter(Boolean);
    if (parts.length >= 2) {
      const owner = parts[parts.length - 2];
      const repo = parts[parts.length - 1].replace(/\.git$/i, "");
      return sanitizeSourceLabel(`${owner}/${repo}`);
    }
    return sanitizeSourceLabel(value || "github");
  }

  try {
    const url = new URL(source.value);
    return sanitizeSourceLabel(url.hostname || source.value);
  } catch {
    return sanitizeSourceLabel(source.value || "registry");
  }
}

/**
 * Lowercase, filesystem-safe form of a label. Used both as the path under
 * `.cursor/rules/<label>/...` and as the prefix in the composite skill
 * identifier `<label>/<name>`.
 *
 * `/` is preserved so multi-segment labels like `owner/repo` map to nested
 * directories (e.g. `.cursor/rules/keska-labs/skills/foo.mdc`) and read
 * naturally in the UI. Each segment is independently lowercased / hyphenated
 * / stripped of unsafe characters; `.` and `..` segments are dropped.
 */
export function sanitizeSourceLabel(raw: string): string {
  const segments = raw
    .split("/")
    .map((segment) => sanitizeLabelSegment(segment))
    .filter((segment) => segment.length > 0 && segment !== "." && segment !== "..");
  if (segments.length === 0) {
    return "source";
  }
  return segments.join("/");
}

function sanitizeLabelSegment(segment: string): string {
  const cleaned = segment.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/-+/g, "-");
  return cleaned.replace(/^-|-$/g, "");
}

export function buildSourceKey(type: SourceMode, value: string): string {
  if (type === "github-repo") {
    return `github:${value.trim()}`;
  }
  return `registry:${value.trim()}`;
}

export function resolveSource(source: SourceConfig): ResolvedSource {
  return {
    type: source.type,
    value: source.value,
    label: deriveSourceLabel(source),
    sourceKey: buildSourceKey(source.type, source.value)
  };
}

export function resolveSources(sources: SourceConfig[]): ResolvedSource[] {
  return sources.map(resolveSource);
}

/**
 * Synthesize a `SourceConfig` array from the legacy flat config keys.
 * Returns an empty array when the legacy values are not configured.
 */
export function buildSourceFromLegacy(
  mode: SourceMode,
  sourceRepository: string,
  registryUrl: string
): SourceConfig[] {
  if (mode === "github-repo") {
    const value = sourceRepository.trim();
    return value ? [{ type: "github-repo", value }] : [];
  }
  const value = registryUrl.trim();
  return value ? [{ type: "custom-registry", value }] : [];
}

/** `<label>/<name>` — opaque workspace identity for an opted-in skill. */
export function compositeSkillKey(label: string, name: string): string {
  return `${label}${COMPOSITE_SEP}${name}`;
}

/**
 * Split a composite key back into `{ label, name }`. Uses the **last** `/`
 * because labels themselves may contain `/` (e.g. multi-segment labels like
 * `owner/repo`), while skill names never do — `normalizeSkillName` always
 * strips slashes.
 */
export function parseCompositeSkillKey(key: string): { label: string; name: string } | null {
  const idx = key.lastIndexOf(COMPOSITE_SEP);
  if (idx <= 0 || idx === key.length - 1) {
    return null;
  }
  return {
    label: key.slice(0, idx),
    name: key.slice(idx + 1)
  };
}

export function isComposite(key: string): boolean {
  return parseCompositeSkillKey(key) !== null;
}

/** A deterministic key combining all configured sources, used for cross-source caches. */
export function combinedSourcesKey(resolvedSources: ResolvedSource[]): string {
  return [...resolvedSources.map((s) => s.sourceKey)].sort().join("|");
}

export function sourceTypeLabel(type: SourceType): string {
  return type === "github-repo" ? "GitHub" : "Registry";
}
