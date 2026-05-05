import { SourceCatalogProvider } from "./SourceCatalogProvider";
import { RepoService } from "./RepoService";
import { RegistryService } from "./RegistryService";
import { GithubCatalogProvider } from "./providers/GithubCatalogProvider";
import { RegistryCatalogProvider } from "./providers/RegistryCatalogProvider";

export class SourceProviderRegistry {
  private readonly providers = new Map<string, SourceCatalogProvider>();
  public constructor(
    private readonly repoService: RepoService,
    private readonly registryService: RegistryService
  ) {}

  public register(sourceKey: string, provider: SourceCatalogProvider): void {
    this.providers.set(sourceKey, provider);
  }

  public get(sourceKey: string): SourceCatalogProvider {
    const existing = this.providers.get(sourceKey);
    if (existing) {
      return existing;
    }

    if (sourceKey.startsWith("github:")) {
      const repoRef = sourceKey.slice("github:".length);
      const parsed = parseGithubRepoRef(repoRef);
      if (!parsed) {
        throw new Error(`Invalid GitHub source key: ${sourceKey}`);
      }
      const provider = new GithubCatalogProvider(this.repoService, parsed.owner, parsed.repo);
      this.providers.set(sourceKey, provider);
      return provider;
    }

    if (sourceKey.startsWith("registry:")) {
      const url = sourceKey.slice("registry:".length).trim();
      const provider = new RegistryCatalogProvider(this.registryService, url || undefined);
      this.providers.set(sourceKey, provider);
      return provider;
    }

    throw new Error(`No source provider registered for ${sourceKey}.`);
  }
}

function parseGithubRepoRef(repoRef: string): { owner: string; repo: string } | null {
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
