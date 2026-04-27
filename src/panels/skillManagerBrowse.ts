import { ConfigService } from "../services/ConfigService";
import { RepoService } from "../services/RepoService";
import { SkillCatalogStore, buildSourceKey } from "../services/SkillCatalogStore";
import { BrowseEntry, ExtensionMessage, SkillInfo } from "../../webview-ui/types/messages";
import { SkillMeta } from "../types";
import { parseGithubRepoRef } from "./skillManagerState";

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

function skillFileMetas(
  repoService: RepoService,
  skillsRoot: string,
  entries: Array<{ name: string; path: string; type: "file" | "dir"; sha: string }>
): SkillMeta[] {
  return entries
    .filter((e) => e.type === "file" && SKILL_FILE.test(e.name))
    .map((e) => repoService.buildSkillMeta(skillsRoot, e.path, e.sha));
}

export async function handleGithubLoadBrowseRoot(
  configService: ConfigService,
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
  const skillsRoot = await repoService.resolveSkillsRootPath(g.owner, g.repo);
  const entries = await repoService.listDirectoryEntries(g.owner, g.repo, skillsRoot);
  postMessage({
    type: "browseUpdate",
    parentPath: skillsRoot,
    entries: toBrowseEntries(entries),
    skillsRootPath: skillsRoot
  });
  catalogStore.merge(g.sourceKey, skillsRoot, skillFileMetas(repoService, skillsRoot, entries));
}

export async function handleGithubExpandBrowsePath(
  configService: ConfigService,
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
  const entries = await repoService.listDirectoryEntries(g.owner, g.repo, dirPath);
  postMessage({
    type: "browseUpdate",
    parentPath: dirPath,
    entries: toBrowseEntries(entries)
  });
  const skillsRoot =
    catalogStore.load(g.sourceKey)?.skillsRoot || (await repoService.resolveSkillsRootPath(g.owner, g.repo));
  catalogStore.merge(g.sourceKey, skillsRoot, skillFileMetas(repoService, skillsRoot, entries));
}

export async function handleGithubSearchCatalog(
  configService: ConfigService,
  repoService: RepoService,
  catalogStore: SkillCatalogStore,
  query: string,
  postMessage: (msg: ExtensionMessage) => void
): Promise<void> {
  if (configService.getSourceMode() !== "github-repo") {
    return;
  }
  const g = githubRepoRef(configService);
  if (!g) {
    return;
  }
  const qTrim = query.trim();
  if (!qTrim) {
    postMessage({ type: "catalogSearchResults", query: "", skills: [] });
    return;
  }
  const all = await repoService.listSkillsInRepo(g.owner, g.repo);
  const root = await repoService.resolveSkillsRootPath(g.owner, g.repo);
  catalogStore.save(g.sourceKey, root, all);
  const q = qTrim.toLowerCase();
  const skills: SkillInfo[] = all
    .filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.description ?? "").toLowerCase().includes(q)
    )
    .map((s) => ({
      name: s.name,
      description: s.description ?? "",
      version: s.version ?? s.shaOrVersion.slice(0, 7),
      category: s.category ?? "Uncategorized"
    }));
  postMessage({ type: "catalogSearchResults", query: qTrim, skills });
}
