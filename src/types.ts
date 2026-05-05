export type SourceMode = "github-repo" | "custom-registry";
export type SourceType = SourceMode;

export interface RepoInfo {
  id: number;
  fullName: string;
  description?: string;
  private: boolean;
}

/**
 * One configured upstream of skills. Persisted to settings as part of `skillSync.sources`.
 *
 * `value` is the repo `owner/repo` for `github-repo`, or the registry base URL for `custom-registry`.
 * `label` is optional; when omitted, callers derive a stable label from `value` via `deriveSourceLabel`.
 */
export interface SourceConfig {
  type: SourceType;
  value: string;
  label?: string;
}

/** Identity of a source resolved at runtime — `label` is always present, derived if not user-set. */
export interface ResolvedSource {
  type: SourceType;
  value: string;
  label: string;
  sourceKey: string;
}

/**
 * `cursor-rule` — a single `.mdc` / `.md` file synced to `.cursor/rules/<name>.mdc`.
 * `skill`       — a directory package with `SKILL.md` synced to `.cursor/skills/<name>/`.
 */
export type SkillType = "cursor-rule" | "skill";

/** Optional workspace hints for recommendations (`metadata.triggers` in SKILL.md / registry). */
export interface SkillTriggers {
  languages?: string[];
  files?: string[];
  dependencies?: string[];
  extensions?: string[];
  keywords?: string[];
  generalPurpose?: boolean;
}

export interface SkillMeta {
  name: string;
  description?: string;
  version?: string;
  category?: string;
  path?: string;
  shaOrVersion: string;
  skillType: SkillType;
  /** For skill packages: absolute repo paths of all files within the package directory. */
  skillFiles?: string[];
  triggers?: SkillTriggers;
  /** Optional source provenance — set by the multi-source orchestrator. */
  source?: SkillMetaSource;
}

export interface SkillMetaSource {
  type: SourceType;
  value: string;
  label: string;
  sourceKey: string;
}

export interface SkillContent {
  content: string;
  shaOrVersion: string;
}

export type SyncStatus = "success" | "partial" | "skipped" | "failed";
export type SyncFailureReason = "none" | "no_session" | "auth_expired" | "network" | "source_invalid" | "unknown";

export interface SyncResult {
  status: SyncStatus;
  reason: SyncFailureReason;
  message: string;
  timestamp: string;
  updated: string[];
  deleted: string[];
  errors: string[];
}
