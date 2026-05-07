/** Legacy single-source migration keys only (`skillSync.sourceMode`). */
export type SourceMode = "github-repo" | "custom-registry";

/** All configured upstream kinds in `skillSync.sources`. */
export type SourceType =
  | SourceMode
  | "official-skills"
  | "open-skills";

/** Reference for installing a discovery-only catalog entry via the real GitHub sync path. */
export interface SkillInstallSourceRef {
  type: "github-repo";
  value: string;
  /** Repo-relative directory containing `SKILL.md` (e.g. `skills/docx`). */
  skillPath?: string;
}

export interface RepoInfo {
  id: number;
  fullName: string;
  description?: string;
  private: boolean;
}

/**
 * One configured upstream of skills. Persisted to settings as part of `skillSync.sources`.
 *
 * `value` is the repo `owner/repo` for `github-repo`, registry base URL for `custom-registry`,
 * or the fixed sentinel `directory` for `official-skills` / `open-skills` singletons.
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
  /** Metadata-only aggregator entries — never synced directly; see `installSourceRef`. */
  isDiscoveryOnly?: boolean;
  /** Underlying GitHub repo (and optional package path) used when enabling this skill. */
  installSourceRef?: SkillInstallSourceRef;
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
export type SyncFailureReason =
  | "none"
  | "no_session"
  | "auth_expired"
  | "rate_limited"
  | "network"
  | "source_invalid"
  | "unknown";

export interface StaleSourceInfo {
  label: string;
  reason: SyncFailureReason;
  /** ISO timestamp of when the upstream is expected to be reachable again. */
  retryAt?: string;
}

export interface SyncResult {
  status: SyncStatus;
  reason: SyncFailureReason;
  message: string;
  timestamp: string;
  updated: string[];
  deleted: string[];
  errors: string[];
  /** Sources whose snapshots were served from cache because the upstream fetch failed. */
  staleSources: StaleSourceInfo[];
}
