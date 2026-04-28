import axios, { AxiosInstance } from "axios";
import { AuthService } from "./AuthService";
import { RepoInfo, SkillContent, SkillMeta, SkillType } from "../types";
import { ServiceError, toServiceError } from "./ServiceError";

interface GitHubRepoResponse {
  id: number;
  full_name: string;
  description: string;
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

/** Parsed fields from a SKILL.md YAML frontmatter block. */
interface SkillManifest {
  name?: string;
  description?: string;
  /** Arbitrary key-value map from the `metadata:` block. */
  metadata?: Record<string, string>;
}

/**
 * Parse the YAML frontmatter from a SKILL.md file.
 * Handles the subset of YAML used by the Agent Skills spec:
 *   - Top-level scalar fields (name, description, license, compatibility, …)
 *   - A nested `metadata:` mapping with string values (version, category, author, …)
 * Does NOT require a YAML library; the spec keeps frontmatter deliberately simple.
 */
function parseSkillMdFrontmatter(content: string): SkillManifest {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    return {};
  }
  const lines = match[1].split(/\r?\n/);
  const result: SkillManifest = {};
  let inMetadata = false;
  const meta: Record<string, string> = {};

  for (const line of lines) {
    // Blank lines are ok
    if (!line.trim()) {
      continue;
    }
    // Start of the `metadata:` block
    if (/^metadata:\s*$/.test(line)) {
      inMetadata = true;
      continue;
    }
    // Indented key under `metadata:`
    if (inMetadata && /^\s{2}/.test(line)) {
      const m = line.match(/^\s{2}([\w-]+):\s*"?([^"]*)"?\s*$/);
      if (m) {
        meta[m[1]] = m[2].trim();
      }
      continue;
    }
    // Any non-indented line ends the metadata block
    inMetadata = false;
    // Top-level scalar: `key: value`
    const top = line.match(/^([\w-]+):\s*(.+)$/);
    if (top) {
      const key = top[1];
      const value = top[2].replace(/^["']|["']$/g, "").trim();
      if (key === "name") {
        result.name = value;
      } else if (key === "description") {
        result.description = value;
      }
    }
  }

  if (Object.keys(meta).length > 0) {
    result.metadata = meta;
  }
  return result;
}

const CONCURRENT_MANIFEST_FETCHES = 5;

export class RepoService {
  private readonly client: AxiosInstance;
  private static readonly MAX_SKILL_FILES = 10000;

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
      const skillsPath = await this.resolveSkillsPath(owner, repo, headers);
      return await this.collectSkillsFromGitTree(owner, repo, skillsPath, headers);
    } catch (error) {
      throw toServiceError(error, `Failed to load skills from ${owner}/${repo}.`);
    }
  }

  public async resolveSkillsRootPath(owner: string, repo: string): Promise<string> {
    const headers = await this.getAuthHeaders();
    return this.resolveSkillsPath(owner, repo, headers);
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

    const parts = rel.split("/").filter(Boolean);
    if (parts.length >= 2) {
      return titleCaseSlug(parts[0]);
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

    const branchRef = await this.client.get<{ object: { sha: string; type: string } }>(
      `/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(defaultBranch)}`,
      { headers }
    );

    const commitSha = branchRef.data.object.sha;
    const commit = await this.client.get<{ tree: { sha: string } }>(`/repos/${owner}/${repo}/git/commits/${commitSha}`, {
      headers
    });

    const treeSha = commit.data.tree.sha;
    const tree = await this.client.get<GitHubTreeResponse>(`/repos/${owner}/${repo}/git/trees/${treeSha}`, {
      headers,
      params: { recursive: "1" }
    });

    if (tree.data.truncated) {
      throw new ServiceError(
        "source_invalid",
        "GitHub tree listing was truncated for this repository. Reduce the repository size under the skills directory."
      );
    }

    const normalizedRoot = rootPath.replace(/^\/+|\/+$/g, "");

    // First pass: identify skill packages (directories that contain a SKILL.md file).
    // SKILL.md is the canonical marker defined by the agentskills.io open standard.
    const skillPackageDirs = new Set<string>();
    const skillManifests: Array<{ dirPath: string; sha: string }> = [];

    for (const item of tree.data.tree) {
      if (item.type !== "blob") {
        continue;
      }
      if (!isUnderRoot(item.path, normalizedRoot)) {
        continue;
      }
      const fileName = item.path.split("/").pop() ?? "";
      if (fileName === "SKILL.md") {
        const dirPath = item.path.slice(0, -"/SKILL.md".length);
        skillPackageDirs.add(dirPath);
        skillManifests.push({ dirPath, sha: item.sha });
      }
    }

    // Second pass: collect cursor-rules and file membership for skill packages
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
      if (!isUnderRoot(item.path, normalizedRoot)) {
        continue;
      }

      totalItems++;
      if (totalItems > RepoService.MAX_SKILL_FILES) {
        const boundedScope = normalizedRoot || "repository root";
        throw new ServiceError(
          "source_invalid",
          `Too many files under ${boundedScope} (>${RepoService.MAX_SKILL_FILES}).`
        );
      }

      // Check if inside a skill package
      const parentSkillDir = findParentSkillDir(item.path, skillPackageDirs);
      if (parentSkillDir) {
        skillPackageFiles.get(parentSkillDir)?.push(item.path);
        continue;
      }

      // Only treat standalone files with known extensions as cursor-rules
      const fileName = item.path.split("/").pop() ?? "";
      if (/\.(md|mdc|yaml|yml)$/i.test(fileName)) {
        cursorRuleMetas.push({
          name: this.deriveSkillName(normalizedRoot, item.path),
          path: item.path,
          shaOrVersion: item.sha,
          version: item.sha.slice(0, 7),
          category: this.deriveCategory(normalizedRoot, item.path),
          skillType: "cursor-rule"
        });
      }
    }

    // Fetch skill.json manifests in parallel for descriptions/metadata
    const skillPackageMetas = await this.fetchSkillManifests(
      owner,
      repo,
      skillManifests,
      skillPackageFiles,
      normalizedRoot,
      headers
    );

    const metas = [...cursorRuleMetas, ...skillPackageMetas];
    metas.sort((a, b) => a.name.localeCompare(b.name));
    return metas;
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
          let parsed: SkillManifest = {};
          try {
            const blobRes = await this.client.get<{ content: string; encoding: string }>(
              `/repos/${owner}/${repo}/git/blobs/${sha}`,
              { headers }
            );
            const raw = Buffer.from(blobRes.data.content, "base64").toString("utf8");
            parsed = parseSkillMdFrontmatter(raw);
          } catch {
            // Fall back to path-derived metadata silently
          }

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
            skillFiles: files
          };
        })
      );
      results.push(...batchResults);
    }

    return results;
  }

  private async resolveSkillsPath(
    owner: string,
    repo: string,
    headers: Record<string, string>
  ): Promise<string> {
    // Prefer repo root first to support dedicated skill repositories that
    // intentionally keep SKILL.md packages or rule files at top-level.
    const candidates = ["", "skills", ".skills", "rules", ".cursor/rules"];

    for (const path of candidates) {
      const resolved = await this.trySkillsDirectory(owner, repo, path, headers);
      if (resolved) {
        return resolved;
      }
    }

    throw new ServiceError(
      "source_invalid",
      `No skills directory found in ${owner}/${repo}. Expected repository root or one of: skills, .skills, rules, .cursor/rules`
    );
  }

  private async trySkillsDirectory(
    owner: string,
    repo: string,
    path: string,
    headers: Record<string, string>
  ): Promise<string | null> {
    try {
      const encodedPath = encodeRepoPath(path);
      const contentsUrl = encodedPath
        ? `/repos/${owner}/${repo}/contents/${encodedPath}`
        : `/repos/${owner}/${repo}/contents`;
      const response = await this.client.get<unknown>(contentsUrl, { headers });
      if (!Array.isArray(response.data)) {
        return null;
      }

      if (!path) {
        // Root is valid only if it has clear skill markers.
        const entries = response.data as GitHubContentResponse[];
        if (!looksLikeSkillsRoot(entries)) {
          return null;
        }
      }

      return path;
    } catch (error: unknown) {
      if (!axios.isAxiosError(error)) {
        return null;
      }

      return null;
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

function looksLikeSkillsRoot(entries: GitHubContentResponse[]): boolean {
  const hasSkillPackageDir = entries.some((entry) => entry.type === "dir" && /^[a-z0-9._-]+$/i.test(entry.name));
  const hasRuleFile = entries.some((entry) => entry.type === "file" && /\.(md|mdc|yaml|yml)$/i.test(entry.name));
  return hasSkillPackageDir || hasRuleFile;
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

function titleCaseSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
