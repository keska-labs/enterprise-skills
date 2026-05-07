import { CatalogSnapshot, DiscoveryDescriptor, SourceCatalogProvider } from "../SourceCatalogProvider";
import { SkillContent } from "../../types";
import { ServiceError } from "../ServiceError";

// `vercel-labs/skills` is the Skills CLI repo (only contains `find-skills`).
// The actual published skill bundle that skills.sh / `npx skills` installs from
// is `vercel-labs/agent-skills`. That's the repo we point the LLM at for discovery.
const OPEN_SKILLS_REPO_URL = "https://github.com/vercel-labs/agent-skills";

export class OpenSkillsCatalogProvider implements SourceCatalogProvider {
  public async fetchCatalog(): Promise<CatalogSnapshot> {
    return { skillsRoot: "", metas: [] };
  }

  public getDiscoveryDescriptor(): DiscoveryDescriptor {
    return {
      repoUrl: OPEN_SKILLS_REPO_URL,
      structureHint:
        "Vercel's official skill bundle (the one `npx skills` / skills.sh installs from). Skills live under `skills/<name>/` — each subdirectory is a self-contained `SKILL.md` package plus supporting files. Pick by directory name; install metadata is `installSource.value = \"vercel-labs/agent-skills\"` with `skillPath = \"skills/<name>\"`. Note: `vercel-labs/skills` is the CLI repo, not the skill bundle — do not use that as `installSource.value`."
    };
  }

  public fetchContent(): Promise<SkillContent> {
    return Promise.reject(
      new ServiceError(
        "source_invalid",
        "Open Agent Skills (skills.sh) is discovery-only — enable a skill to add its underlying GitHub repository."
      )
    );
  }
}
