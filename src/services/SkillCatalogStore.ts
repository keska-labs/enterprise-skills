import * as vscode from "vscode";
import { SkillMeta } from "../types";
import { ConfigService } from "./ConfigService";
import { buildSourceKey as buildSourceKeyFromTypes } from "../utils/sources";

const STORAGE_VERSION = 6; // bumped: discovery sources no longer persist prefetched metas (LLM prompt only)

interface StoredCatalogPayload {
  v: typeof STORAGE_VERSION;
  savedAt: string;
  skillsRoot: string;
  metas: SkillMeta[];
}

function catalogKey(sourceKey: string): string {
  return `agentSkillSync.catalog.v${STORAGE_VERSION}:${sourceKey}`;
}

/**
 * Browse (`skillManagerBrowse`) merges directory listings built without manifest bodies.
 * Those entries must not overwrite a full `listSkillsInRepo` index (description, triggers, skillFiles).
 */
function isBrowseListingStub(meta: SkillMeta): boolean {
  return (
    meta.description === undefined &&
    meta.triggers === undefined &&
    (meta.skillFiles === undefined || meta.skillFiles.length === 0)
  );
}

function hasIndexedManifest(meta: SkillMeta): boolean {
  return (
    meta.description !== undefined ||
    meta.triggers !== undefined ||
    (meta.skillFiles !== undefined && meta.skillFiles.length > 0)
  );
}

function mergeSkillMetaEntry(prev: SkillMeta, incoming: SkillMeta): SkillMeta {
  if (isBrowseListingStub(incoming) && hasIndexedManifest(prev)) {
    return prev;
  }
  return incoming;
}

/**
 * Legacy single-source key builder. Multi-source callers should use
 * `buildSourceKey` from `../utils/sources` and pass the typed source value.
 * Kept here as a thin shim so existing import sites continue to compile.
 */
export function buildSourceKey(sourceMode: "github-repo" | "custom-registry", sourceRepository: string, registryUrl: string): string {
  if (sourceMode === "github-repo") {
    return buildSourceKeyFromTypes("github-repo", sourceRepository);
  }
  return buildSourceKeyFromTypes("custom-registry", registryUrl);
}

/** Legacy: returns the first configured source's key, or "" when none. */
export function currentSourceKey(configService: ConfigService): string {
  const sources = configService.getResolvedSources();
  return sources[0]?.sourceKey ?? "";
}

export class SkillCatalogStore {
  public constructor(private readonly memento: vscode.Memento) {}

  public load(sourceKey: string): { skillsRoot: string; metas: SkillMeta[] } | undefined {
    const raw = this.memento.get<string | undefined>(catalogKey(sourceKey), undefined);
    if (!raw) {
      return undefined;
    }
    try {
      const parsed = JSON.parse(raw) as StoredCatalogPayload;
      if (!parsed || parsed.v !== STORAGE_VERSION || !Array.isArray(parsed.metas)) {
        return undefined;
      }
      return {
        skillsRoot: parsed.skillsRoot ?? "",
        metas: parsed.metas
      };
    } catch {
      return undefined;
    }
  }

  public save(sourceKey: string, skillsRoot: string, metas: SkillMeta[]): void {
    const payload: StoredCatalogPayload = {
      v: STORAGE_VERSION,
      savedAt: new Date().toISOString(),
      skillsRoot,
      metas
    };
    void this.memento.update(catalogKey(sourceKey), JSON.stringify(payload));
  }

  public merge(sourceKey: string, skillsRoot: string, incoming: SkillMeta[]): void {
    const existing = this.load(sourceKey);
    const map = new Map<string, SkillMeta>();
    for (const meta of existing?.metas ?? []) {
      map.set(meta.name, meta);
    }
    for (const meta of incoming) {
      const prev = map.get(meta.name);
      map.set(meta.name, prev ? mergeSkillMetaEntry(prev, meta) : meta);
    }
    this.save(sourceKey, skillsRoot || existing?.skillsRoot || "", [...map.values()]);
  }

  public clear(sourceKey: string): void {
    void this.memento.update(catalogKey(sourceKey), undefined);
  }
}
