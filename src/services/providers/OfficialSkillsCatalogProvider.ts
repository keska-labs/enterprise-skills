import { CatalogSnapshot, DiscoveryDescriptor, SourceCatalogProvider } from "../SourceCatalogProvider";
import { SkillContent } from "../../types";
import { ServiceError } from "../ServiceError";

const OFFICIAL_SKILLS_REPO_URL = "https://github.com/VoltAgent/awesome-agent-skills";

export class OfficialSkillsCatalogProvider implements SourceCatalogProvider {
  public async fetchCatalog(): Promise<CatalogSnapshot> {
    return { skillsRoot: "", metas: [] };
  }

  public getDiscoveryDescriptor(): DiscoveryDescriptor {
    return {
      repoUrl: OFFICIAL_SKILLS_REPO_URL,
      structureHint:
        "Curated awesome-list `README.md` of third-party GitHub repos that publish Cursor / Claude agent skills. Each entry links to a separate `owner/repo`; skills inside each linked repo follow the usual layout (a `SKILL.md` package directory or `.cursor/rules/<name>.mdc`). Pick by skill name from a repo you know; set `installSource.value = \"<that owner/repo>\"` and `skillPath` to the subdirectory containing `SKILL.md` (omit when the skill is at the repo root)."
    };
  }

  public fetchContent(): Promise<SkillContent> {
    return Promise.reject(
      new ServiceError(
        "source_invalid",
        "Official Agent Skills (officialskills.sh) is discovery-only — enable a skill to add its underlying GitHub repository."
      )
    );
  }
}
