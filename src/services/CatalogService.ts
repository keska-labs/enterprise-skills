import { ResolvedSource, SkillContent, SkillMeta, SkillMetaSource } from "../types";
import { SkillCatalogStore } from "./SkillCatalogStore";
import { CatalogSnapshot } from "./SourceCatalogProvider";
import { SourceProviderRegistry } from "./SourceProviderRegistry";

export class CatalogService {
  private readonly inFlight = new Map<string, Promise<CatalogSnapshot>>();

  public constructor(
    private readonly store: SkillCatalogStore,
    private readonly providers: SourceProviderRegistry
  ) {}

  /**
   * Fetch the catalog for a single source. Accepts either a raw `sourceKey`
   * string (legacy callers) or a `ResolvedSource` so the loaded metas can be
   * stamped with their source provenance.
   */
  public async getCatalog(
    sourceOrKey: string | ResolvedSource,
    opts?: { forceRefresh?: boolean }
  ): Promise<CatalogSnapshot> {
    const forceRefresh = opts?.forceRefresh ?? false;
    const sourceKey = typeof sourceOrKey === "string" ? sourceOrKey : sourceOrKey.sourceKey;
    const stamp = typeof sourceOrKey === "string" ? undefined : toMetaSource(sourceOrKey);

    if (!forceRefresh) {
      const cached = this.store.load(sourceKey);
      if (cached && cached.metas.length > 0 && !hasIncompleteSkillPackages(cached.metas)) {
        return stamp ? withSource(cached, stamp) : cached;
      }
    }

    const existing = this.inFlight.get(sourceKey);
    if (existing) {
      return existing;
    }

    const provider = this.providers.get(sourceKey);
    const pending = provider.fetchCatalog()
      .then((snapshot) => {
        this.store.save(sourceKey, snapshot.skillsRoot, snapshot.metas);
        return stamp ? withSource(snapshot, stamp) : snapshot;
      })
      .finally(() => {
        this.inFlight.delete(sourceKey);
      });

    this.inFlight.set(sourceKey, pending);
    return pending;
  }

  public getContent(sourceKey: string, path: string): Promise<SkillContent> {
    return this.providers.get(sourceKey).fetchContent(path);
  }

  public mergeBrowseListing(sourceKey: string, skillsRoot: string, metas: SkillMeta[]): void {
    this.store.merge(sourceKey, skillsRoot, metas);
  }

  public async listChildren(sourceKey: string, path: string): Promise<Array<{ name: string; path: string; type: "file" | "dir"; sha: string }>> {
    const provider = this.providers.get(sourceKey);
    if (!provider.listChildren) {
      return [];
    }
    return provider.listChildren(path);
  }
}

function toMetaSource(resolved: ResolvedSource): SkillMetaSource {
  return {
    type: resolved.type,
    value: resolved.value,
    label: resolved.label,
    sourceKey: resolved.sourceKey
  };
}

function withSource(snapshot: CatalogSnapshot, source: SkillMetaSource): CatalogSnapshot {
  return {
    skillsRoot: snapshot.skillsRoot,
    metas: snapshot.metas.map((meta) => ({ ...meta, source }))
  };
}

export function hasIncompleteSkillPackages(metas: SkillMeta[]): boolean {
  return metas.some((meta) => meta.skillType === "skill" && (meta.skillFiles?.length ?? 0) === 0);
}
