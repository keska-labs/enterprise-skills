import { ConfigService } from "../services/ConfigService";
import { CatalogService } from "../services/CatalogService";
import { RepoService } from "../services/RepoService";
import { SkillCatalogStore, buildSourceKey } from "../services/SkillCatalogStore";
import { BrowseEntry, ExtensionMessage } from "../../webview-ui/types/messages";
import { SkillMeta } from "../types";
import { parseGithubRepoRef } from "./skillManagerState";
import { persistCatalogManifestFromStore } from "../utils/catalogManifest";

const SKILL_FILE = /\.(md|mdc|yaml|yml)$/i;

type GithubSource = { owner: string; repo: string; sourceKey: string };

function githubRepoRef(configService: ConfigService): GithubSource | null {
  const repoRef = configService.getSourceRepository();
  const parsed = parseGithubRepoRef(repoRef);
  if (!parsed) {
    return null;
  }
  return {
    owner: parsed.owner,
    repo: parsed.repo,
    sourceKey: buildSourceKey("github-repo", repoRef, "")
  };
}

function toBrowseEntries(
  entries: Array<{ name: string; path: string; type: "file" | "dir"; sha: string }>
): BrowseEntry[] {
  return entries.map((e) => ({ name: e.name, path: e.path, type: e.type }));
}

/**
 * Build SkillMeta from a directory listing, distinguishing skill packages
 * (directories that contain a SKILL.md — agentskills.io standard) from
 * cursor-rules (standalone .md/.mdc/.yaml/.yml files).
 * At browse time we only have directory entries, not file contents, so
 * directories are optimistically tagged as "skill"; the full git-tree scan
 * in RepoService confirms the type by detecting the SKILL.md file.
 * [`SkillCatalogStore.merge`](src/services/SkillCatalogStore.ts) keeps existing
 * indexed rows (description, triggers, skillFiles) when these browse stubs would overwrite them.
 */
function skillFileMetas(
  repoService: RepoService,
  skillsRoot: string,
  entries: Array<{ name: string; path: string; type: "file" | "dir"; sha: string }>
): SkillMeta[] {
  const metas: SkillMeta[] = [];

  for (const e of entries) {
    if (e.type === "dir") {
      // Directories visible in browse are potential skill packages
      metas.push(repoService.buildSkillMeta(skillsRoot, e.path, e.sha, "skill"));
    } else if (SKILL_FILE.test(e.name)) {
      metas.push(repoService.buildSkillMeta(skillsRoot, e.path, e.sha, "cursor-rule"));
    }
  }

  return metas;
}

export async function handleGithubLoadBrowseRoot(
  configService: ConfigService,
  catalogService: CatalogService,
  repoService: RepoService,
  catalogStore: SkillCatalogStore,
  postMessage: (msg: ExtensionMessage) => void
): Promise<void> {
  if (configService.getSourceMode() !== "github-repo") {
    return;
  }
  const g = githubRepoRef(configService);
  if (!g) {
    postMessage({ type: "error", message: "Invalid repository format." });
    return;
  }
  const cachedRoot = catalogStore.load(g.sourceKey)?.skillsRoot;
  const skillsRoot = cachedRoot || await repoService.resolveSkillsRootPath(g.owner, g.repo);
  const entries = await catalogService.listChildren(g.sourceKey, skillsRoot);
  postMessage({
    type: "browseUpdate",
    parentPath: skillsRoot,
    entries: toBrowseEntries(entries),
    skillsRootPath: skillsRoot
  });
  catalogService.mergeBrowseListing(g.sourceKey, skillsRoot, skillFileMetas(repoService, skillsRoot, entries));
  persistCatalogManifestFromStore(catalogStore, g.sourceKey);
}

export async function handleGithubExpandBrowsePath(
  configService: ConfigService,
  catalogService: CatalogService,
  repoService: RepoService,
  catalogStore: SkillCatalogStore,
  dirPath: string,
  postMessage: (msg: ExtensionMessage) => void
): Promise<void> {
  if (configService.getSourceMode() !== "github-repo") {
    return;
  }
  const g = githubRepoRef(configService);
  if (!g) {
    return;
  }
  const entries = await catalogService.listChildren(g.sourceKey, dirPath);
  postMessage({
    type: "browseUpdate",
    parentPath: dirPath,
    entries: toBrowseEntries(entries)
  });
  const snapshot = await catalogService.getCatalog(g.sourceKey);
  const skillsRoot = snapshot.skillsRoot || await repoService.resolveSkillsRootPath(g.owner, g.repo);
  catalogService.mergeBrowseListing(g.sourceKey, skillsRoot, skillFileMetas(repoService, skillsRoot, entries));
  persistCatalogManifestFromStore(catalogStore, g.sourceKey);
}
