import { SkillContent, SkillMeta } from "../types";
import { SkillCatalogStore } from "./SkillCatalogStore";
import { CatalogSnapshot } from "./SourceCatalogProvider";
import { SourceProviderRegistry } from "./SourceProviderRegistry";

export class CatalogService {
  private readonly inFlight = new Map<string, Promise<CatalogSnapshot>>();

  public constructor(
    private readonly store: SkillCatalogStore,
    private readonly providers: SourceProviderRegistry
  ) {}

  public async getCatalog(sourceKey: string, opts?: { forceRefresh?: boolean }): Promise<CatalogSnapshot> {
    const forceRefresh = opts?.forceRefresh ?? false;
    if (!forceRefresh) {
      const cached = this.store.load(sourceKey);
      if (cached && cached.metas.length > 0 && !hasIncompleteSkillPackages(cached.metas)) {
        return cached;
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
        return snapshot;
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

export function hasIncompleteSkillPackages(metas: SkillMeta[]): boolean {
  return metas.some((meta) => meta.skillType === "skill" && (meta.skillFiles?.length ?? 0) === 0);
}
