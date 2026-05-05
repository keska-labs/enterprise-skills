import { RepoService } from "../RepoService";
import { BrowseChildEntry, CatalogSnapshot, SourceCatalogProvider } from "../SourceCatalogProvider";

export class GithubCatalogProvider implements SourceCatalogProvider {
  public constructor(
    private readonly repoService: RepoService,
    private readonly owner: string,
    private readonly repo: string
  ) {}

  public async fetchCatalog(): Promise<CatalogSnapshot> {
    const [metas, skillsRoot] = await Promise.all([
      this.repoService.listSkillsInRepo(this.owner, this.repo),
      this.repoService.resolveSkillsRootPath(this.owner, this.repo)
    ]);
    return { skillsRoot, metas };
  }

  public fetchContent(path: string) {
    return this.repoService.getSkillContent(this.owner, this.repo, path);
  }

  public listChildren(path: string): Promise<BrowseChildEntry[]> {
    return this.repoService.listDirectoryEntries(this.owner, this.repo, path);
  }
}
