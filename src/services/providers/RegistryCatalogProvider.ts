import { RegistryService } from "../RegistryService";
import { CatalogSnapshot, SourceCatalogProvider } from "../SourceCatalogProvider";

export class RegistryCatalogProvider implements SourceCatalogProvider {
  /**
   * `registryUrl` is the per-source base URL for this provider instance —
   * mandatory in the multi-source flow so two registries can coexist. When
   * omitted, `RegistryService` falls back to the deprecated
   * `skillSync.registryUrl` setting (legacy single-source path).
   */
  public constructor(
    private readonly registryService: RegistryService,
    private readonly registryUrl?: string
  ) {}

  public async fetchCatalog(): Promise<CatalogSnapshot> {
    const metas = await this.registryService.listSkills(this.registryUrl);
    return { skillsRoot: "", metas };
  }

  public fetchContent(path: string) {
    return this.registryService.getSkillContent(path, this.registryUrl);
  }
}
