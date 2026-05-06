/**
 * `cursor-rule` — a single `.mdc` file synced to `.cursor/rules/<label>/`.
 * `skill`       — a directory package synced to `.cursor/skills/<label>/`.
 */
export type SkillType = "cursor-rule" | "skill";

export type SourceType =
  | "github-repo"
  | "custom-registry"
  | "official-skills"
  | "open-skills";

export interface SkillSourceInfo {
  label: string;
  type: SourceType;
  sourceKey: string;
}

export interface SkillSourceState extends SkillSourceInfo {
  value: string;
}

export interface SkillInfo {
  /** Stable identifier `<sourceLabel>/<name>` used for opted-in tracking and React keys. */
  compositeKey: string;
  name: string;
  description: string;
  version: string;
  category: string;
  skillType: SkillType;
  /** Number of files in the package (only meaningful for `skill` type). */
  fileCount?: number;
  source?: SkillSourceInfo;
  /** Aggregator entries — opt-in adds the backing GitHub repo. */
  isDiscoveryOnly?: boolean;
  /** Non-installable directory summary row (officialskills.sh / skills.sh). */
  isDiscoverySummary?: boolean;
}

export type RecommendationMatchKind = "strong" | "weak" | "general";

export interface Recommendation {
  skill: SkillInfo;
  score: number;
  reasons: string[];
  matchKind: RecommendationMatchKind;
  /** Primary LLM explanation when ranked by a language model. */
  aiReason?: string;
}

export interface CategoryData {
  name: string;
  skills: SkillInfo[];
}

export interface BrowseEntry {
  name: string;
  path: string;
  type: "file" | "dir";
}

export type CatalogStatus = "idle" | "loading" | "ready" | "error";

export interface SkillManagerState {
  sources: SkillSourceState[];
  categories: CategoryData[];
  enabledCategories: CategoryData[];
  /** Composite keys (`<sourceLabel>/<name>`). */
  optedInSkills: string[];
  lastSyncTime: string | null;
  isConnected: boolean;
  connectionHealth: "ok" | "auth_required" | "invalid_source" | "offline" | "unknown";
  syncStatus: "idle" | "running" | "success" | "partial" | "failed";
  lastError: string | null;
  syncMessage: string | null;
  catalogStatus: CatalogStatus;
  catalogError: string | null;
  skillsRootPath: string | null;
  browseEntries: BrowseEntry[];
  catalogSize: number;
}

export type SkillManagerMainTab = "manage" | "browse" | "recommended";

export type WebviewMessage =
  | { type: "ready" }
  | { type: "addSource" }
  | { type: "removeSource"; sourceKey: string }
  | { type: "disconnectAll" }
  | { type: "syncNow" }
  | { type: "toggleSkill"; compositeKey: string; optIn: boolean }
  | { type: "getState" }
  | { type: "getCatalog" }
  | { type: "loadBrowseRoot"; sourceKey: string }
  | { type: "expandBrowsePath"; sourceKey: string; path: string }
  | { type: "requestRecommendations" }
  | { type: "refreshRecommendations" }
  | { type: "askAgentToRecommend" }
  | { type: "tabChanged"; tab: SkillManagerMainTab };

export type ExtensionMessage =
  | { type: "setState"; payload: SkillManagerState }
  | {
    type: "syncComplete";
    payload: {
      status: "success" | "partial" | "skipped" | "failed";
      reason: "none" | "no_session" | "auth_expired" | "network" | "source_invalid" | "unknown";
      message: string;
      timestamp: string;
      updated: string[];
      deleted: string[];
      errors: string[];
    };
  }
  | { type: "error"; message: string }
  | { type: "browseUpdate"; sourceKey: string; parentPath: string; entries: BrowseEntry[]; skillsRootPath?: string }
  | { type: "catalogResult"; skills: SkillInfo[] }
  | {
    type: "recommendationsResult";
    recommendations: Recommendation[];
    catalogReady: boolean;
    source: "llm" | "heuristic";
    providerId?: string;
  };
