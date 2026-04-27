export type SourceMode = "github-repo" | "custom-registry";

export interface RepoInfo {
  id: number;
  fullName: string;
  description?: string;
  private: boolean;
}

export interface SkillMeta {
  name: string;
  description?: string;
  version?: string;
  category?: string;
  path?: string;
  shaOrVersion: string;
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
