import * as vscode from "vscode";
import { ConfigService } from "../services/ConfigService";
import { SyncEngine } from "../services/SyncEngine";
import { Logger } from "../utils/logger";
import { deleteSkillFile, deleteSkillPackage, listExistingSkillFiles, listExistingSkillPackages } from "../utils/fileUtils";
import { ServiceError } from "../services/ServiceError";
import { SkillCatalogStore, currentSourceKey } from "../services/SkillCatalogStore";
import { CatalogService } from "../services/CatalogService";
import { CategoryData, SkillInfo, SkillManagerState } from "../../webview-ui/types/messages";
import { SkillMeta } from "../types";

interface SkillManagerStateDependencies {
  configService: ConfigService;
  syncEngine: SyncEngine;
  logger: Logger;
  catalogStore: SkillCatalogStore;
  catalogService: CatalogService;
}

export async function buildSkillManagerState(deps: SkillManagerStateDependencies): Promise<SkillManagerState> {
  const { configService, syncEngine, logger, catalogStore, catalogService } = deps;
  const sourceMode = configService.getSourceMode();
  const sourceRepository = configService.getSourceRepository();
  const registryUrl = configService.getRegistryUrl();
  const optedInSkills = configService.getOptedInSkills();
  const categories = configService.getCategories();
  const lastResult = syncEngine.getLastResult();

  const sourceKey = currentSourceKey(configService);
  const cached = catalogStore.load(sourceKey);
  let catalogSize = cached?.metas.length ?? 0;

  let connectionHealth: SkillManagerState["connectionHealth"] = "unknown";
  let lastError: string | null = null;
  let isConnected = false;
  let registryCategories: CategoryData[] = categories.map((name) => ({ name, skills: [] }));

  if (sourceMode === "github-repo") {
    if (!sourceRepository.trim()) {
      connectionHealth = "unknown";
      isConnected = false;
    } else {
      const parsed = parseGithubRepoRef(sourceRepository);
      if (!parsed?.owner || !parsed.repo) {
        connectionHealth = "invalid_source";
        lastError = "Repository format must be owner/repository.";
        isConnected = false;
      } else {
        isConnected = true;
        connectionHealth = "ok";
      }
    }
  } else if (!registryUrl.trim()) {
    connectionHealth = "invalid_source";
    lastError = "Registry URL is required for custom registry mode.";
    isConnected = false;
  } else {
    isConnected = true;
    try {
      const skills = (await catalogService.getCatalog(sourceKey)).metas;
      registryCategories = categorizeSkills(registryCategories, skills);
      connectionHealth = "ok";
      catalogSize = skills.length;
    } catch (error) {
      logger.error("Failed to build skill manager state (registry)", error);
      if (error instanceof ServiceError) {
        connectionHealth = mapReasonToHealth(error.reason);
        lastError = error.message;
      } else {
        connectionHealth = "unknown";
        lastError = error instanceof Error ? error.message : String(error);
      }
    }
  }

  const metaByName = new Map<string, SkillMeta>();
  for (const m of cached?.metas ?? []) {
    metaByName.set(m.name, m);
  }

  const enabledSkills: SkillInfo[] = optedInSkills.map((name) => {
    const meta = metaByName.get(name);
    return {
      name,
      description: meta?.description ?? "",
      version: meta?.version ?? (meta?.shaOrVersion ? meta.shaOrVersion.slice(0, 7) : ""),
      category: meta?.category ?? "Enabled",
      skillType: meta?.skillType ?? "cursor-rule",
      fileCount: meta?.skillFiles?.length
    };
  });

  const enabledCategories: CategoryData[] =
    enabledSkills.length > 0 ? [{ name: "Enabled", skills: enabledSkills }] : [];

  return {
    sourceRepository,
    sourceMode,
    categories: sourceMode === "custom-registry" ? registryCategories : categories.map((name) => ({ name, skills: [] })),
    enabledCategories,
    optedInSkills,
    lastSyncTime: syncEngine.getLastSyncTime()?.toISOString() ?? null,
    isConnected,
    connectionHealth,
    syncStatus: lastResult.status === "skipped" ? "idle" : lastResult.status,
    syncMessage: lastResult.message,
    lastError,
    catalogStatus: "idle",
    catalogError: null,
    skillsRootPath: cached?.skillsRoot ?? null,
    browseEntries: [],
    catalogSize
  };
}

export function fallbackSkillManagerState(partial: Partial<SkillManagerState>): SkillManagerState {
  return {
    sourceRepository: "",
    sourceMode: "github-repo",
    categories: [],
    enabledCategories: [],
    optedInSkills: [],
    lastSyncTime: null,
    isConnected: false,
    connectionHealth: "unknown",
    syncStatus: "idle",
    lastError: null,
    syncMessage: null,
    catalogStatus: "idle",
    catalogError: null,
    skillsRootPath: null,
    browseEntries: [],
    catalogSize: 0,
    ...partial
  };
}

export async function disconnectSource(configService: ConfigService, catalogStore: SkillCatalogStore): Promise<boolean> {
  const confirm = await vscode.window.showWarningMessage(
    "Disconnecting will remove synced files from .cursor/rules and .cursor/skills in this workspace.",
    { modal: true },
    "Disconnect"
  );

  if (confirm !== "Disconnect") {
    return false;
  }

  const sourceKey = currentSourceKey(configService);
  catalogStore.clear(sourceKey);

  await configService.setSourceRepository("");
  await configService.setOptedInSkills([]);
  const [existingFiles, existingPackages] = await Promise.all([
    listExistingSkillFiles(),
    listExistingSkillPackages()
  ]);
  await Promise.all([
    ...existingFiles.map((skillName) => deleteSkillFile(skillName)),
    ...existingPackages.map((pkgName) => deleteSkillPackage(pkgName))
  ]);
  return true;
}

function categorizeSkills(
  initialCategories: CategoryData[],
  skills: Array<{ name: string; description?: string; version?: string; category?: string; shaOrVersion: string; skillType?: SkillMeta["skillType"]; skillFiles?: string[] }>
): CategoryData[] {
  const categoryMap = new Map(initialCategories.map((category) => [category.name, category.skills]));
  for (const skill of skills) {
    const category = skill.category ?? "Uncategorized";
    if (!categoryMap.has(category)) {
      categoryMap.set(category, []);
    }
    categoryMap.get(category)?.push({
      name: skill.name,
      description: skill.description ?? "",
      version: skill.version ?? skill.shaOrVersion.slice(0, 7),
      category,
      skillType: skill.skillType ?? "cursor-rule",
      fileCount: skill.skillFiles?.length
    });
  }
  return [...categoryMap.entries()].map(([name, categorySkills]) => ({ name, skills: categorySkills }));
}

function mapReasonToHealth(reason: string): SkillManagerState["connectionHealth"] {
  if (reason === "no_session" || reason === "auth_expired") {
    return "auth_required";
  }
  if (reason === "network") {
    return "offline";
  }
  if (reason === "source_invalid") {
    return "invalid_source";
  }
  return "unknown";
}

export function parseGithubRepoRef(repoRef: string): { owner: string; repo: string } | null {
  const trimmed = repoRef.trim();
  const sshMatch = trimmed.match(/[:/]([^/\s:]+)\/([^/\s]+?)(?:\.git)?$/);
  if (sshMatch) {
    return {
      owner: sshMatch[1],
      repo: sshMatch[2]
    };
  }

  const parts = trimmed.split("/").filter(Boolean);
  if (parts.length === 2) {
    return {
      owner: parts[0],
      repo: parts[1].replace(/\.git$/i, "")
    };
  }

  return null;
}
