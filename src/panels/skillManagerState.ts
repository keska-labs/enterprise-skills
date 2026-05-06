import * as vscode from "vscode";
import { ConfigService } from "../services/ConfigService";
import { SyncEngine } from "../services/SyncEngine";
import { Logger } from "../utils/logger";
import {
  deleteSkillFile,
  deleteSkillPackage,
  ExistingSkillFile,
  ExistingSkillPackage,
  listExistingSkillFiles,
  listExistingSkillPackages
} from "../utils/fileUtils";
import { ServiceError } from "../services/ServiceError";
import { SkillCatalogStore } from "../services/SkillCatalogStore";
import { CatalogService } from "../services/CatalogService";
import { MultiSourceCatalogService } from "../services/MultiSourceCatalogService";
import { CategoryData, SkillInfo, SkillManagerState, SkillSourceInfo, SkillSourceState } from "../../webview-ui/types/messages";
import { ResolvedSource, SkillMeta } from "../types";
import { compositeSkillKey, parseCompositeSkillKey } from "../utils/sources";

interface SkillManagerStateDependencies {
  configService: ConfigService;
  syncEngine: SyncEngine;
  logger: Logger;
  catalogStore: SkillCatalogStore;
  catalogService: CatalogService;
  multiSourceService: MultiSourceCatalogService;
}

export async function buildSkillManagerState(deps: SkillManagerStateDependencies): Promise<SkillManagerState> {
  const { configService, syncEngine, logger, catalogStore, multiSourceService } = deps;
  const sources = configService.getResolvedSources();
  const optedInSkills = normalizeOptedInToComposite(configService.getOptedInSkills(), sources);
  const categories = configService.getCategories();
  const lastResult = syncEngine.getLastResult();

  const sourceStates: SkillSourceState[] = sources.map((source) => ({
    type: source.type,
    value: source.value,
    label: source.label,
    sourceKey: source.sourceKey
  }));

  let connectionHealth: SkillManagerState["connectionHealth"] = sources.length === 0 ? "unknown" : "ok";
  let isConnected = sources.length > 0;
  let lastError: string | null = null;
  let registryCategories: CategoryData[] = categories.map((name) => ({ name, skills: [] }));
  let mergedMetas: SkillMeta[] = [];
  let catalogSize = 0;

  for (const source of sources) {
    const cached = catalogStore.load(source.sourceKey);
    if (cached?.metas?.length) {
      catalogSize += cached.metas.length;
      mergedMetas.push(
        ...cached.metas.map((meta) => ({
          ...meta,
          source: { type: source.type, value: source.value, label: source.label, sourceKey: source.sourceKey }
        }))
      );
    }
  }

  const hasRegistry = sources.some((s) => s.type === "custom-registry");
  if (hasRegistry) {
    try {
      const merged = await multiSourceService.getMergedCatalog(sources);
      mergedMetas = merged.metas;
      catalogSize = merged.metas.length;
      registryCategories = categorizeSkills(registryCategories, merged.metas);
      const errors = merged.perSource.filter((p) => p.error).map((p) => `${p.source.label}: ${p.error}`);
      if (errors.length > 0) {
        lastError = errors.join("; ");
        connectionHealth = "unknown";
      }
    } catch (error) {
      logger.error("Failed to build skill manager state (multi-source)", error);
      if (error instanceof ServiceError) {
        connectionHealth = mapReasonToHealth(error.reason);
        lastError = error.message;
      } else {
        connectionHealth = "unknown";
        lastError = error instanceof Error ? error.message : String(error);
      }
    }
  }

  for (const source of sources) {
    if (source.type === "github-repo") {
      const parsed = parseGithubRepoRef(source.value);
      if (!parsed?.owner || !parsed.repo) {
        connectionHealth = "invalid_source";
        lastError = lastError ?? `Source ${source.label}: repository format must be owner/repository.`;
        isConnected = false;
      }
    } else if (!source.value.trim()) {
      connectionHealth = "invalid_source";
      lastError = lastError ?? `Source ${source.label}: registry URL is required.`;
      isConnected = false;
    }
  }

  const metaByCompositeKey = new Map<string, SkillMeta>();
  for (const meta of mergedMetas) {
    const label = meta.source?.label ?? sources[0]?.label;
    if (!label) {
      continue;
    }
    metaByCompositeKey.set(compositeSkillKey(label, meta.name), meta);
  }

  const enabledSkills: SkillInfo[] = optedInSkills.map((compositeKey) => {
    const meta = metaByCompositeKey.get(compositeKey);
    const parsed = parseCompositeSkillKey(compositeKey);
    const fallbackLabel = parsed?.label ?? sources[0]?.label ?? "";
    const fallbackName = parsed?.name ?? compositeKey;
    const sourceInfo: SkillSourceInfo | undefined = meta?.source
      ? { label: meta.source.label, type: meta.source.type, sourceKey: meta.source.sourceKey }
      : sources.find((s) => s.label === fallbackLabel)
        ? { label: fallbackLabel, type: sources.find((s) => s.label === fallbackLabel)!.type, sourceKey: sources.find((s) => s.label === fallbackLabel)!.sourceKey }
        : undefined;
    return {
      compositeKey,
      name: meta?.name ?? fallbackName,
      description: meta?.description ?? "",
      version: meta?.version ?? (meta?.shaOrVersion ? meta.shaOrVersion.slice(0, 7) : ""),
      category: meta?.category ?? "Enabled",
      skillType: meta?.skillType ?? "cursor-rule",
      fileCount: meta?.skillFiles?.length,
      source: sourceInfo
    };
  });

  const enabledCategories: CategoryData[] =
    enabledSkills.length > 0 ? [{ name: "Enabled", skills: enabledSkills }] : [];

  return {
    sources: sourceStates,
    categories: hasRegistry ? registryCategories : categories.map((name) => ({ name, skills: [] })),
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
    skillsRootPath: null,
    browseEntries: [],
    catalogSize
  };
}

export function fallbackSkillManagerState(partial: Partial<SkillManagerState>): SkillManagerState {
  return {
    sources: [],
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

export async function disconnectAllSources(
  configService: ConfigService,
  catalogStore: SkillCatalogStore
): Promise<boolean> {
  const confirm = await vscode.window.showWarningMessage(
    "Disconnecting will remove all configured skill sources and delete synced files from .cursor/rules and .cursor/skills in this workspace.",
    { modal: true },
    "Disconnect"
  );

  if (confirm !== "Disconnect") {
    return false;
  }

  const sources = configService.getResolvedSources();
  for (const source of sources) {
    catalogStore.clear(source.sourceKey);
  }

  await configService.setSources([]);
  await configService.setOptedInSkills([]);
  const [existingFiles, existingPackages]: [ExistingSkillFile[], ExistingSkillPackage[]] = await Promise.all([
    listExistingSkillFiles(),
    listExistingSkillPackages()
  ]);
  await Promise.all([
    ...existingFiles.map((entry) => entry.label && deleteSkillFile(entry.label, entry.name)),
    ...existingPackages.map((entry) => entry.label && deleteSkillPackage(entry.label, entry.name))
  ]);
  return true;
}

export async function disconnectSource(
  configService: ConfigService,
  catalogStore: SkillCatalogStore,
  sourceKey: string
): Promise<boolean> {
  const sources = configService.getResolvedSources();
  const target = sources.find((s) => s.sourceKey === sourceKey);
  if (!target) {
    return false;
  }
  const confirm = await vscode.window.showWarningMessage(
    `Remove source ${target.label}? Synced files in .cursor/rules/${target.label}/ and .cursor/skills/${target.label}/ will be deleted.`,
    { modal: true },
    "Remove"
  );
  if (confirm !== "Remove") {
    return false;
  }
  catalogStore.clear(target.sourceKey);
  await configService.removeSource((s) => s.type === target.type && s.value === target.value);
  const remaining = configService.getOptedInSkills().filter((entry) => {
    const parsed = parseCompositeSkillKey(entry);
    return parsed ? parsed.label !== target.label : true;
  });
  await configService.setOptedInSkills(remaining);

  const [existingFiles, existingPackages] = await Promise.all([
    listExistingSkillFiles(),
    listExistingSkillPackages()
  ]);
  await Promise.all([
    ...existingFiles
      .filter((e) => e.label === target.label)
      .map((e) => deleteSkillFile(e.label, e.name)),
    ...existingPackages
      .filter((e) => e.label === target.label)
      .map((e) => deleteSkillPackage(e.label, e.name))
  ]);
  return true;
}

function categorizeSkills(initialCategories: CategoryData[], metas: SkillMeta[]): CategoryData[] {
  const categoryMap = new Map(initialCategories.map((category) => [category.name, category.skills]));
  for (const meta of metas) {
    const category = meta.category ?? "Uncategorized";
    if (!categoryMap.has(category)) {
      categoryMap.set(category, []);
    }
    const label = meta.source?.label ?? "";
    categoryMap.get(category)?.push({
      compositeKey: compositeSkillKey(label, meta.name),
      name: meta.name,
      description: meta.description ?? "",
      version: meta.version ?? meta.shaOrVersion.slice(0, 7),
      category,
      skillType: meta.skillType ?? "cursor-rule",
      fileCount: meta.skillFiles?.length,
      source: meta.source
        ? { label: meta.source.label, type: meta.source.type, sourceKey: meta.source.sourceKey }
        : undefined
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

/**
 * Promote any bare-name entries to composite keys using the first matching
 * source. Used by the panel state code when a user toggled a skill before
 * the persisted opted-in array had the chance to migrate (e.g. mid-flight).
 */
export function normalizeOptedInToComposite(entries: string[], sources: ResolvedSource[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    const parsed = parseCompositeSkillKey(entry);
    if (parsed) {
      if (!seen.has(entry)) {
        seen.add(entry);
        out.push(entry);
      }
      continue;
    }
    const fallbackLabel = sources[0]?.label ?? "";
    const composite = fallbackLabel ? compositeSkillKey(fallbackLabel, entry) : entry;
    if (!seen.has(composite)) {
      seen.add(composite);
      out.push(composite);
    }
  }
  return out;
}
