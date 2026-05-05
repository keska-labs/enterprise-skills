import { RegistryService } from "../RegistryService";
import { CatalogSnapshot, SourceCatalogProvider } from "../SourceCatalogProvider";

export class RegistryCatalogProvider implements SourceCatalogProvider {
  public constructor(private readonly registryService: RegistryService) {}

  public async fetchCatalog(): Promise<CatalogSnapshot> {
    const metas = await this.registryService.listSkills();
    return { skillsRoot: "", metas };
  }

  public fetchContent(path: string) {
    return this.registryService.getSkillContent(path);
  }
}
