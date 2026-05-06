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

/**
 * Static descriptor for an LLM-backed discovery source. We deliberately do **not** ship
 * the source's README into the prompt: most "directory" READMEs are CLI marketing or
 * dense awesome-lists that bloat the prompt without helping ranking. Instead we point
 * the LLM at the repo URL and describe the layout, and let the model use its own
 * knowledge of these well-known public repos to pick relevant skills.
 */
export interface DiscoveryDescriptor {
  /** Public GitHub URL the LLM is told to consider as the listing it should pick from. */
  repoUrl: string;
  /** One-paragraph description of how skills are organized in that repo (paths, conventions). */
  structureHint: string;
}

export interface SourceCatalogProvider {
  fetchCatalog(): Promise<CatalogSnapshot>;
  fetchContent(path: string): Promise<SkillContent>;
  listChildren?(path: string): Promise<BrowseChildEntry[]>;
  /**
   * Discovery-only providers expose a static descriptor (no network) that the recommender
   * embeds in the prompt instead of prefetching/embedding the source's README markdown.
   */
  getDiscoveryDescriptor?(): DiscoveryDescriptor;
}
