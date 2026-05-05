import axios, { AxiosInstance } from "axios";
import { AuthService } from "./AuthService";
import { RepoInfo, SkillContent, SkillMeta, SkillType } from "../types";
import { ServiceError, toServiceError } from "./ServiceError";
import { parseSkillMdFrontmatter } from "../utils/skillMdFrontmatter";

interface GitHubRepoResponse {
  id: number;
  full_name: string;
  description: string | null;
  private: boolean;
}

interface GitHubOrgResponse {
  login: string;
}

interface GitHubContentResponse {
  name: string;
  path: string;
  sha: string;
  type: "file" | "dir";
  content?: string;
}

interface GitHubRepoDetailResponse {
  default_branch: string;
}

interface GitHubTreeItem {
  path: string;
  mode: string;
  type: "blob" | "tree" | "commit";
  sha: string;
  size?: number;
  url?: string;
}

interface GitHubTreeResponse {
  sha: string;
  url: string;
  truncated?: boolean;
  tree: GitHubTreeItem[];
}

const CONCURRENT_MANIFEST_FETCHES = 5;
const MAX_STANDALONE_RULE_FRONTMATTER_FETCHES = 35;

export class RepoService {
  private readonly client: AxiosInstance;
  private static readonly MAX_SKILL_FILES = 10000;
  // Blob SHAs are content-addressed and immutable, so a parsed frontmatter
  // result is safe to reuse for the lifetime of the process. This dedupes
  // blob GETs across catalog refreshes (sign-in retries, opt-in toggles,
  // background syncs) without invalidating when content changes — a new
  // commit will produce a different SHA.
  private readonly blobFrontmatterCache = new Map<string, ReturnType<typeof parseSkillMdFrontmatter>>();
  private static readonly MAX_BLOB_CACHE_ENTRIES = 2000;

  public constructor(private readonly authService: AuthService) {
    this.client = axios.create({
      baseURL: "https://api.github.com",
      timeout: 30000,
      headers: {
        Accept: "application/vnd.github+json"
      }
    });
  }

  private async getAuthHeaders(): Promise<Record<string, string>> {
    const token = await this.authService.getToken(false);
    if (!token) {
      throw new ServiceError("no_session", "No GitHub session is available.");
    }

    return {
      Authorization: `Bearer ${token}`
    };
  }

  public async listUserRepos(): Promise<RepoInfo[]> {
    try {
      const headers = await this.getAuthHeaders();
      const response = await this.client.get<GitHubRepoResponse[]>("/user/repos?per_page=100&type=all", { headers });
      return response.data.map((repo) => ({
        id: repo.id,
        fullName: repo.full_name,
        description: repo.description ?? "",
        private: repo.private
      }));
    } catch (error) {
      throw toServiceError(error, "Failed to load repositories from GitHub.");
    }
  }

  public async listUserOrgs(): Promise<string[]> {
    try {
      const headers = await this.getAuthHeaders();
      const response = await this.client.get<GitHubOrgResponse[]>("/user/orgs?per_page=100", { headers });
      return response.data.map((org) => org.login);
    } catch (error) {
      throw toServiceError(error, "Failed to load organizations from GitHub.");
    }
  }

  /**
   * Look up a single repository by `owner/repo` regardless of whether the user
   * is a collaborator or member of the owning org. Used by the "Add Skill
   * Source" command to accept any public repo the token can read (and any
   * private repo the token has been granted access to). Returns `null` when
   * the repo doesn't exist or the token cannot see it.
   */
  public async getRepoInfo(owner: string, repo: string): Promise<RepoInfo | null> {
    try {
      const headers = await this.getAuthHeaders();
      const response = await this.client.get<GitHubRepoResponse>(`/repos/${owner}/${repo}`, { headers });
      return {
        id: response.data.id,
        fullName: response.data.full_name,
        description: response.data.description ?? "",
        private: response.data.private
      };
    } catch (error) {
      if (axios.isAxiosError(error) && (error.response?.status === 404 || error.response?.status === 403)) {
        return null;
      }
      throw toServiceError(error, `Failed to look up repository ${owner}/${repo}.`);
    }
  }

  public async listOrgRepos(org: string): Promise<RepoInfo[]> {
    try {
      const headers = await this.getAuthHeaders();
      const response = await this.client.get<GitHubRepoResponse[]>(`/orgs/${org}/repos?per_page=100&type=all`, { headers });
      return response.data.map((repo) => ({
        id: repo.id,
        fullName: repo.full_name,
        description: repo.description ?? "",
        private: repo.private
      }));
    } catch (error) {
      throw toServiceError(error, `Failed to load repositories for organization ${org}.`);
    }
  }

  public async listSkillsInRepo(owner: string, repo: string): Promise<SkillMeta[]> {
    try {
      const headers = await this.getAuthHeaders();
      // Recursively scan the whole repo (with exclusions) instead of requiring
      // a fixed `skills/` or `.cursor/rules/` layout. The browse UI also
      // anchors at the repo root for the same reason.
      return await this.collectSkillsFromGitTree(owner, repo, "", headers);
    } catch (error) {
      throw toServiceError(error, `Failed to load skills from ${owner}/${repo}.`);
    }
  }

  public async resolveSkillsRootPath(): Promise<string> {
    // Recursive discovery means the browse tree starts at the repo root for
    // every source. Kept as a method (and not a constant) so the call sites
    // can stay unchanged and we can revisit this later if we ever introduce
    // per-source root configuration.
    return "";
  }

  public async listDirectoryEntries(
    owner: string,
    repo: string,
    dirPath: string
  ): Promise<Array<{ name: string; path: string; type: "file" | "dir"; sha: string }>> {
    try {
      const headers = await this.getAuthHeaders();
      const encodedPath = encodeRepoPath(dirPath);
      const contentsUrl = encodedPath
        ? `/repos/${owner}/${repo}/contents/${encodedPath}`
        : `/repos/${owner}/${repo}/contents`;
      const response = await this.client.get<unknown>(
        contentsUrl,
        { headers }
      );
      if (!Array.isArray(response.data)) {
        return [];
      }
      return (response.data as GitHubContentResponse[])
        .filter((item) => item.type === "file" || item.type === "dir")
        .map((item) => ({
          name: item.name,
          path: item.path,
          type: item.type,
          sha: item.sha
        }));
    } catch (error) {
      throw toServiceError(error, `Failed to list directory ${dirPath}.`);
    }
  }

  /**
   * Build a SkillMeta from a known path and sha. Used by browse handlers.
   * For directory entries (skill packages) caller should pass `skillType: "skill"`.
   */
  public buildSkillMeta(
    skillsRoot: string,
    filePath: string,
    sha: string,
    skillType: SkillType = "cursor-rule"
  ): SkillMeta {
    const root = skillsRoot.replace(/^\/+|\/+$/g, "");
    return {
      name: this.deriveSkillName(root, filePath),
      path: filePath,
      shaOrVersion: sha,
      version: sha.slice(0, 7),
      category: this.deriveCategory(root, filePath),
      skillType
    };
  }

  public async getSkillContent(owner: string, repo: string, path: string): Promise<SkillContent> {
    try {
      const headers = await this.getAuthHeaders();
      const response = await this.client.get<GitHubContentResponse>(
        `/repos/${owner}/${repo}/contents/${encodeRepoPath(path)}`,
        { headers }
      );
      if (!response.data.content) {
        throw new ServiceError("source_invalid", `No file content returned for ${path}`);
      }
      const decoded = Buffer.from(response.data.content, "base64").toString("utf8");
      return {
        content: decoded,
        shaOrVersion: response.data.sha
      };
    } catch (error) {
      throw toServiceError(error, `Failed to fetch skill content at ${path}.`);
    }
  }

  private deriveCategory(root: string, filePath: string): string {
    const rel = relativePathFromRoot(root, filePath);
    if (!rel) {
      return "Uncategorized";
    }

    // Skip well-known container folders (`skills/`, `rules/`, `.cursor/rules/`)
    // when picking a category — they describe layout, not topic. Use the next
    // path segment so e.g. `skills/security/foo.md` becomes "Security".
    const parts = rel.split("/").filter(Boolean);
    const meaningful = parts.filter((seg) => !CATEGORY_TRANSPARENT_DIRS.has(seg));
    if (meaningful.length >= 2) {
      return titleCaseSlug(meaningful[0]);
    }

    return titleCaseSlug(root.split("/").filter(Boolean).slice(-1)[0] ?? "Uncategorized");
  }

  private deriveSkillName(root: string, filePath: string): string {
    const rel = relativePathFromRoot(root, filePath);
    if (!rel) {
      const base = filePath.split("/").pop() ?? filePath;
      return base.replace(/\.(md|mdc|yaml|yml)$/i, "");
    }

    const withoutExt = rel.replace(/\.(md|mdc|yaml|yml)$/i, "");
    return withoutExt.split("/").filter(Boolean).join("-");
  }

  private async collectSkillsFromGitTree(
    owner: string,
    repo: string,
    rootPath: string,
    headers: Record<string, string>
  ): Promise<SkillMeta[]> {
    const repoResponse = await this.client.get<GitHubRepoDetailResponse>(`/repos/${owner}/${repo}`, { headers });
    const defaultBranch = repoResponse.data.default_branch;
    if (!defaultBranch) {
      throw new ServiceError("source_invalid", `Unable to determine default branch for ${owner}/${repo}.`);
    }

    // Resolve directly from the branch name. GitHub's `git/trees/{ref}` endpoint
    // accepts a branch ref, saving the previous git/ref + git/commits round-trips.
    const tree = await this.client.get<GitHubTreeResponse>(
      `/repos/${owner}/${repo}/git/trees/${encodeURIComponent(defaultBranch)}`,
      {
        headers,
        params: { recursive: "1" }
      }
    );

    if (tree.data.truncated) {
      throw new ServiceError(
        "source_invalid",
        "GitHub tree listing was truncated for this repository — it has too many files to scan recursively."
      );
    }

    const normalizedRoot = rootPath.replace(/^\/+|\/+$/g, "");

    // First pass: identify skill packages (directories that contain a SKILL.md
    // file). SKILL.md is the canonical marker defined by the agentskills.io
    // open standard. We accept SKILL.md anywhere in the repo so authors aren't
    // forced into a fixed `skills/` layout — but exclusions still apply (e.g.
    // we skip the consumer's own `.cursor/skills/` so resynced packages don't
    // get re-published).
    const skillPackageDirs = new Set<string>();
    const skillManifests: Array<{ dirPath: string; sha: string }> = [];

    for (const item of tree.data.tree) {
      if (item.type !== "blob") {
        continue;
      }
      if (!isUnderRoot(item.path, normalizedRoot) || isExcludedPath(item.path)) {
        continue;
      }
      const fileName = item.path.split("/").pop() ?? "";
      if (fileName === "SKILL.md") {
        const dirPath = item.path.slice(0, -"/SKILL.md".length);
        skillPackageDirs.add(dirPath);
        skillManifests.push({ dirPath, sha: item.sha });
      }
    }

    // Second pass: collect cursor-rules and file membership for skill packages.
    // Standalone rule detection rules:
    //   - `.mdc` (Cursor-specific extension) anywhere → always a rule
    //   - `.md` / `.yaml` / `.yml` only inside known rule directories
    //     (`rules/`, `skills/`, `.skills/`) — avoids picking up README.md,
    //     CONTRIBUTING.md, and other documentation as accidental "skills".
    const cursorRuleMetas: SkillMeta[] = [];
    const skillPackageFiles = new Map<string, string[]>();
    for (const dir of skillPackageDirs) {
      skillPackageFiles.set(dir, []);
    }

    let totalItems = 0;
    for (const item of tree.data.tree) {
      if (item.type !== "blob") {
        continue;
      }
      if (!isUnderRoot(item.path, normalizedRoot) || isExcludedPath(item.path)) {
        continue;
      }

      totalItems++;
      if (totalItems > RepoService.MAX_SKILL_FILES) {
        const boundedScope = normalizedRoot || "repository";
        throw new ServiceError(
          "source_invalid",
          `Too many files under ${boundedScope} (>${RepoService.MAX_SKILL_FILES}).`
        );
      }

      const parentSkillDir = findParentSkillDir(item.path, skillPackageDirs);
      if (parentSkillDir) {
        skillPackageFiles.get(parentSkillDir)?.push(item.path);
        continue;
      }

      const fileName = item.path.split("/").pop() ?? "";
      if (!isStandaloneRuleCandidate(item.path, fileName)) {
        continue;
      }

      cursorRuleMetas.push({
        name: this.deriveSkillName(normalizedRoot, item.path),
        path: item.path,
        shaOrVersion: item.sha,
        version: item.sha.slice(0, 7),
        category: this.deriveCategory(normalizedRoot, item.path),
        skillType: "cursor-rule"
      });
    }

    const skillPackageMetas = await this.fetchSkillManifests(
      owner,
      repo,
      skillManifests,
      skillPackageFiles,
      normalizedRoot,
      headers
    );

    await this.enrichStandaloneCursorRulesWithTriggers(owner, repo, cursorRuleMetas, headers);

    const metas = [...cursorRuleMetas, ...skillPackageMetas];
    if (metas.length === 0) {
      throw new ServiceError(
        "source_invalid",
        `${owner}/${repo} doesn't contain any skill files. ` +
          `Looked for SKILL.md packages and standalone .mdc / .md / .yaml / .yml rules anywhere in the repo (excluding ${EXCLUDED_HUMAN_LABEL}). ` +
          `If this is an "awesome list" or docs repo, add one of the linked skill repos directly instead.`
      );
    }
    metas.sort((a, b) => a.name.localeCompare(b.name));
    return metas;
  }

  /**
   * Fetch and parse a blob's frontmatter, sharing a content-addressed cache
   * so the same blob SHA never gets re-fetched within a single session.
   */
  private async parseBlobFrontmatter(
    owner: string,
    repo: string,
    sha: string,
    headers: Record<string, string>
  ): Promise<ReturnType<typeof parseSkillMdFrontmatter>> {
    const cached = this.blobFrontmatterCache.get(sha);
    if (cached) {
      return cached;
    }
    try {
      const blobRes = await this.client.get<{ content: string; encoding: string }>(
        `/repos/${owner}/${repo}/git/blobs/${sha}`,
        { headers }
      );
      const raw = Buffer.from(blobRes.data.content, "base64").toString("utf8");
      const parsed = parseSkillMdFrontmatter(raw);
      // Bound the cache so a runaway monorepo can't grow it unbounded; the
      // blob fetches it would skip on cache hit are pure savings — evicting
      // just means we'd re-fetch on the next refresh.
      if (this.blobFrontmatterCache.size >= RepoService.MAX_BLOB_CACHE_ENTRIES) {
        const firstKey = this.blobFrontmatterCache.keys().next().value;
        if (firstKey !== undefined) {
          this.blobFrontmatterCache.delete(firstKey);
        }
      }
      this.blobFrontmatterCache.set(sha, parsed);
      return parsed;
    } catch {
      return {};
    }
  }

  private async fetchSkillManifests(
    owner: string,
    repo: string,
    manifests: Array<{ dirPath: string; sha: string }>,
    packageFiles: Map<string, string[]>,
    normalizedRoot: string,
    headers: Record<string, string>
  ): Promise<SkillMeta[]> {
    const results: SkillMeta[] = [];

    for (let i = 0; i < manifests.length; i += CONCURRENT_MANIFEST_FETCHES) {
      const batch = manifests.slice(i, i + CONCURRENT_MANIFEST_FETCHES);
      const batchResults = await Promise.all(
        batch.map(async ({ dirPath, sha }) => {
          const parsed = await this.parseBlobFrontmatter(owner, repo, sha, headers);

          const files = packageFiles.get(dirPath) ?? [];
          // Per the spec, name must equal the directory name — prefer frontmatter name
          // but fall back to the path-derived name if the manifest is missing or invalid.
          const derivedName = this.deriveSkillName(normalizedRoot, dirPath);
          const name = parsed.name ?? derivedName;
          const version = parsed.metadata?.["version"] ?? sha.slice(0, 7);
          const category = parsed.metadata?.["category"] ?? this.deriveCategory(normalizedRoot, dirPath);
          return {
            name,
            description: parsed.description ?? undefined,
            version,
            category,
            path: dirPath,
            shaOrVersion: sha,
            skillType: "skill" as const,
            skillFiles: files,
            triggers: parsed.triggers
          };
        })
      );
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Fetch small rule blobs to read YAML frontmatter for triggers (capped).
   */
  private async enrichStandaloneCursorRulesWithTriggers(
    owner: string,
    repo: string,
    cursorRuleMetas: SkillMeta[],
    headers: Record<string, string>
  ): Promise<void> {
    const targets = cursorRuleMetas.filter((m) => {
      const leaf = m.path?.split("/").pop() ?? "";
      return /\.(md|mdc)$/i.test(leaf);
    });
    const capped = targets.slice(0, MAX_STANDALONE_RULE_FRONTMATTER_FETCHES);

    for (let i = 0; i < capped.length; i += CONCURRENT_MANIFEST_FETCHES) {
      const batch = capped.slice(i, i + CONCURRENT_MANIFEST_FETCHES);
      await Promise.all(
        batch.map(async (meta) => {
          try {
            const parsed = await this.parseBlobFrontmatter(owner, repo, meta.shaOrVersion, headers);
            if (parsed.name) {
              meta.name = parsed.name;
            }
            if (parsed.description) {
              meta.description = parsed.description;
            }
            if (parsed.triggers) {
              meta.triggers = parsed.triggers;
            }
          } catch {
            // ignore per-file failures
          }
        })
      );
    }
  }

}

function findParentSkillDir(filePath: string, skillDirs: Set<string>): string | null {
  for (const dir of skillDirs) {
    if (filePath.startsWith(`${dir}/`)) {
      return dir;
    }
  }
  return null;
}

/**
 * Top-level directories ignored during recursive discovery.
 *
 * `.cursor/` is the destination this very extension writes to — including it
 * would re-publish skills the upstream repo had only consumed. The rest are
 * standard build/vendor/IDE folders that never contain authored skills.
 */
const EXCLUDED_TOP_LEVEL_DIRS = new Set<string>([
  ".cursor",
  ".git",
  ".github",
  ".gitlab",
  ".vscode",
  ".idea",
  ".husky",
  ".yarn",
  ".pnpm-store",
  ".cache",
  ".turbo",
  ".next",
  ".nuxt",
  ".svelte-kit",
  ".astro",
  "node_modules",
  "vendor",
  "dist",
  "build",
  "out",
  "target",
  "bin",
  "obj",
  "coverage",
  "__pycache__",
  ".venv",
  "venv",
  "env",
  ".tox",
  ".pytest_cache",
  ".mypy_cache",
  ".ruff_cache",
  ".gradle",
  ".mvn",
  ".terraform"
]);

const EXCLUDED_HUMAN_LABEL = ".cursor/, node_modules/, dist/, build/, .git/, and similar build/IDE folders";

/**
 * Directory names whose contents are considered eligible for `.md`/`.yaml`/
 * `.yml` standalone rules. Outside these folders we only treat `.mdc` files
 * as rules (so README.md, CHANGELOG.md, etc. don't accidentally become
 * skills).
 */
const RULE_FOLDER_NAMES = new Set<string>(["rules", "skills", ".skills"]);

export function isExcludedPath(filePath: string): boolean {
  const segments = filePath.split("/");
  return segments.some((seg) => EXCLUDED_TOP_LEVEL_DIRS.has(seg));
}

/**
 * Decide whether a non-package file should be treated as a standalone Cursor
 * rule. Rules:
 *   - `.mdc` is the Cursor-specific extension; always treat as a rule.
 *   - `.md` / `.yaml` / `.yml` only count when an ancestor directory is a
 *     well-known rule folder (`rules/`, `skills/`, `.skills/`).
 */
export function isStandaloneRuleCandidate(filePath: string, fileName: string): boolean {
  if (/\.mdc$/i.test(fileName)) {
    return true;
  }
  if (!/\.(md|yaml|yml)$/i.test(fileName)) {
    return false;
  }
  const segments = filePath.split("/").slice(0, -1);
  return segments.some((seg) => RULE_FOLDER_NAMES.has(seg));
}

function encodeRepoPath(repoPath: string): string {
  return repoPath
    .split("/")
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function isUnderRoot(filePath: string, normalizedRoot: string): boolean {
  if (!normalizedRoot) {
    return true;
  }
  return filePath === normalizedRoot || filePath.startsWith(`${normalizedRoot}/`);
}

function relativePathFromRoot(root: string, filePath: string): string {
  const normalizedRoot = root.replace(/^\/+|\/+$/g, "");
  const normalizedFile = filePath.replace(/^\/+|\/+$/g, "");
  if (!normalizedRoot) {
    return normalizedFile;
  }

  if (normalizedFile === normalizedRoot) {
    return "";
  }

  const prefix = `${normalizedRoot}/`;
  if (!normalizedFile.startsWith(prefix)) {
    return normalizedFile;
  }

  return normalizedFile.slice(prefix.length);
}

/** Container dir names that describe layout, not topic — skipped by category derivation. */
const CATEGORY_TRANSPARENT_DIRS = new Set<string>([
  "skills",
  ".skills",
  "rules",
  ".cursor"
]);

function titleCaseSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
