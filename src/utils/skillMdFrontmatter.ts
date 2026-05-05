import { SkillTriggers } from "../types";

/** Parsed fields from a SKILL.md / cursor-rule YAML frontmatter block. */
export interface SkillManifest {
  name?: string;
  description?: string;
  /** Flat metadata keys (excluding nested `triggers`). */
  metadata?: Record<string, string>;
  triggers?: SkillTriggers;
}

function trimScalar(value: string): string {
  let v = value.trim();
  while (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1).trim();
  }
  return v;
}

/** Split on commas not inside straight single/double quotes. */
function splitCommaList(value: string): string[] {
  const out: string[] = [];
  let buf = "";
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (quote) {
      buf += ch;
      if (ch === quote) {
        quote = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      buf += ch;
      continue;
    }
    if (ch === ",") {
      const t = trimScalar(buf);
      if (t) {
        out.push(t);
      }
      buf = "";
      continue;
    }
    buf += ch;
  }
  const last = trimScalar(buf);
  if (last) {
    out.push(last);
  }
  return out;
}

function parseTriggerScalar(key: string, raw: string): Partial<SkillTriggers> {
  const v = raw.trim();
  if (key === "generalPurpose") {
    const lower = v.toLowerCase();
    return { generalPurpose: lower === "true" || lower === "yes" };
  }
  const list = splitCommaList(v);
  if (list.length === 0) {
    return {};
  }
  switch (key) {
    case "languages":
      return { languages: list.map((s) => s.toLowerCase()) };
    case "files":
      return { files: list };
    case "dependencies":
      return { dependencies: list.map((s) => s.toLowerCase()) };
    case "extensions":
      return { extensions: list.map((s) => s.toLowerCase()) };
    case "keywords":
      return { keywords: list.map((s) => s.toLowerCase()) };
    default:
      return {};
  }
}

function mergeTriggers(base: SkillTriggers, patch: Partial<SkillTriggers>): SkillTriggers {
  const next: SkillTriggers = { ...base };
  for (const key of Object.keys(patch) as Array<keyof SkillTriggers>) {
    const val = patch[key];
    if (val === undefined) {
      continue;
    }
    if (key === "generalPurpose" && typeof val === "boolean") {
      next.generalPurpose = val;
      continue;
    }
    if (Array.isArray(val)) {
      const prev = (next[key] as string[] | undefined) ?? [];
      next[key] = [...prev, ...val] as never;
    }
  }
  return next;
}

/**
 * Parse the YAML frontmatter from a SKILL.md or rule file.
 * Supports top-level `name` / `description`, a `metadata:` block with string scalars,
 * and nested `metadata.triggers:` with comma-separated list values.
 */
export function parseSkillMdFrontmatter(content: string): SkillManifest {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    return {};
  }
  const lines = match[1].split(/\r?\n/);
  const result: SkillManifest = {};
  const meta: Record<string, string> = {};
  let inMetadata = false;
  let inTriggers = false;
  let triggersAcc: SkillTriggers = {};

  for (const line of lines) {
    if (!line.trim()) {
      continue;
    }

    if (inTriggers) {
      const deep = line.match(/^\s{4}([\w-]+):\s*(.+)$/);
      if (deep) {
        const patch = parseTriggerScalar(deep[1], deep[2]);
        triggersAcc = mergeTriggers(triggersAcc, patch);
        continue;
      }
      inTriggers = false;
    }

    if (inMetadata) {
      if (/^\s{2}triggers:\s*$/.test(line)) {
        inTriggers = true;
        continue;
      }
      const metaLine = line.match(/^\s{2}([\w-]+):\s*(.*)$/);
      if (metaLine) {
        meta[metaLine[1]] = trimScalar(metaLine[2]);
        continue;
      }
      inMetadata = false;
    }

    if (/^metadata:\s*$/.test(line)) {
      inMetadata = true;
      inTriggers = false;
      continue;
    }

    const top = line.match(/^([\w-]+):\s*(.+)$/);
    if (top) {
      const key = top[1];
      const value = trimScalar(top[2]);
      if (key === "name") {
        result.name = value;
      } else if (key === "description") {
        result.description = value;
      }
    }
  }

  if (Object.keys(meta).length > 0) {
    result.metadata = meta;
  }
  if (Object.keys(triggersAcc).length > 0) {
    result.triggers = triggersAcc;
  }
  return result;
}
