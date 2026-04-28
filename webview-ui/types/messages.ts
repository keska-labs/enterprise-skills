/**
 * `cursor-rule` — a single `.mdc` file synced to `.cursor/rules/`.
 * `skill`       — a directory package synced to `.cursor/skills/`.
 */
export type SkillType = "cursor-rule" | "skill";

export interface SkillInfo {
  name: string;
  description: string;
  version: string;
  category: string;
  skillType: SkillType;
  /** Number of files in the package (only meaningful for `skill` type). */
  fileCount?: number;
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
  sourceRepository: string;
  sourceMode: "github-repo" | "custom-registry";
  categories: CategoryData[];
  enabledCategories: CategoryData[];
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

export type WebviewMessage =
  | { type: "ready" }
  | { type: "connectRepo" }
  | { type: "disconnectRepo" }
  | { type: "syncNow" }
  | { type: "toggleSkill"; skillName: string; optIn: boolean }
  | { type: "getState" }
  | { type: "loadBrowseRoot" }
  | { type: "expandBrowsePath"; path: string }
  | { type: "searchCatalog"; query: string };

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
  | { type: "browseUpdate"; parentPath: string; entries: BrowseEntry[]; skillsRootPath?: string }
  | { type: "catalogSearchResults"; query: string; skills: SkillInfo[] };
