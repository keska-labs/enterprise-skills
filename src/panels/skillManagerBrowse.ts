import { ConfigService } from "../services/ConfigService";
import { CatalogService } from "../services/CatalogService";
import { RepoService } from "../services/RepoService";
import { SkillCatalogStore } from "../services/SkillCatalogStore";
import { BrowseEntry, ExtensionMessage } from "../../webview-ui/types/messages";
import { ResolvedSource, SkillMeta } from "../types";
import { parseGithubRepoRef } from "./skillManagerState";
import { persistCatalogManifestFromStore } from "../utils/catalogManifest";

const SKILL_FILE = /\.(md|mdc|yaml|yml)$/i;

function findGithubSource(configService: ConfigService, sourceKey: string): ResolvedSource | null {
  const sources = configService.getResolvedSources();
  return sources.find((s) => s.sourceKey === sourceKey && s.type === "github-repo") ?? null;
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
  sourceKey: string,
  postMessage: (msg: ExtensionMessage) => void
): Promise<void> {
  const source = findGithubSource(configService, sourceKey);
  if (!source) {
    postMessage({ type: "error", message: "Selected source is not a GitHub source." });
    return;
  }
  const parsed = parseGithubRepoRef(source.value);
  if (!parsed) {
    postMessage({ type: "error", message: `Invalid repository format for source ${source.label}.` });
    return;
  }
  const cachedRoot = catalogStore.load(source.sourceKey)?.skillsRoot;
  const skillsRoot = cachedRoot ?? await repoService.resolveSkillsRootPath();
  const entries = await catalogService.listChildren(source.sourceKey, skillsRoot);
  postMessage({
    type: "browseUpdate",
    sourceKey: source.sourceKey,
    parentPath: skillsRoot,
    entries: toBrowseEntries(entries),
    skillsRootPath: skillsRoot
  });
  catalogService.mergeBrowseListing(source.sourceKey, skillsRoot, skillFileMetas(repoService, skillsRoot, entries));
  persistCatalogManifestFromStore(catalogStore, source.sourceKey);
}

export async function handleGithubExpandBrowsePath(
  configService: ConfigService,
  catalogService: CatalogService,
  repoService: RepoService,
  catalogStore: SkillCatalogStore,
  sourceKey: string,
  dirPath: string,
  postMessage: (msg: ExtensionMessage) => void
): Promise<void> {
  const source = findGithubSource(configService, sourceKey);
  if (!source) {
    return;
  }
  if (!parseGithubRepoRef(source.value)) {
    return;
  }
  const entries = await catalogService.listChildren(source.sourceKey, dirPath);
  postMessage({
    type: "browseUpdate",
    sourceKey: source.sourceKey,
    parentPath: dirPath,
    entries: toBrowseEntries(entries)
  });
  const snapshot = await catalogService.getCatalog(source);
  const skillsRoot = snapshot.skillsRoot ?? await repoService.resolveSkillsRootPath();
  catalogService.mergeBrowseListing(source.sourceKey, skillsRoot, skillFileMetas(repoService, skillsRoot, entries));
  persistCatalogManifestFromStore(catalogStore, source.sourceKey);
}
