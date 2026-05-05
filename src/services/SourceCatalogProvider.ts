import { SkillContent, SkillMeta, SyncFailureReason } from "../types";

export interface BrowseChildEntry {
  name: string;
  path: string;
  type: "file" | "dir";
  sha: string;
}

export interface CatalogSnapshot {
  skillsRoot: string;
  metas: SkillMeta[];
  /** Set when this snapshot was served from cache because the upstream fetch failed (e.g. rate-limited). */
  isStale?: boolean;
  /** The reason the upstream fetch failed, only set when `isStale` is true. */
  staleReason?: SyncFailureReason;
  /** ISO timestamp of when the upstream is expected to be reachable again, only set when `isStale` is true. */
  retryAt?: string;
}

export interface SourceCatalogProvider {
  fetchCatalog(): Promise<CatalogSnapshot>;
  fetchContent(path: string): Promise<SkillContent>;
  listChildren?(path: string): Promise<BrowseChildEntry[]>;
}
