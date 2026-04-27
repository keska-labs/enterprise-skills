import axios, { AxiosInstance } from "axios";
import { AuthService } from "./AuthService";
import { RepoInfo, SkillContent, SkillMeta } from "../types";
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
      const response = await this.client.get<unknown>(
        `/repos/${owner}/${repo}/contents/${encodeRepoPath(dirPath)}`,
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

  public buildSkillMeta(skillsRoot: string, filePath: string, sha: string): SkillMeta {
    const root = skillsRoot.replace(/^\/+|\/+$/g, "");
    return {
      name: this.deriveSkillName(root, filePath),
      path: filePath,
      shaOrVersion: sha,
      version: sha.slice(0, 7),
      category: this.deriveCategory(root, filePath)
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
    const prefix = `${normalizedRoot}/`;

    const metas: SkillMeta[] = [];
    for (const item of tree.data.tree) {
      if (item.type !== "blob") {
        continue;
      }

      if (!item.path.startsWith(prefix) && item.path !== normalizedRoot) {
        continue;
      }

      const fileName = item.path.split("/").pop() ?? item.path;
      if (!/\.(md|mdc|yaml|yml)$/i.test(fileName)) {
        continue;
      }

      metas.push({
        name: this.deriveSkillName(normalizedRoot, item.path),
        path: item.path,
        shaOrVersion: item.sha,
        version: item.sha.slice(0, 7),
        category: this.deriveCategory(normalizedRoot, item.path)
      });

      if (metas.length > RepoService.MAX_SKILL_FILES) {
        throw new ServiceError(
          "source_invalid",
          `Too many skill files under ${normalizedRoot} (>${RepoService.MAX_SKILL_FILES}).`
        );
      }
    }

    metas.sort((a, b) => a.name.localeCompare(b.name));
    return metas;
  }

  private async resolveSkillsPath(
    owner: string,
    repo: string,
    headers: Record<string, string>
  ): Promise<string> {
    const candidates = [".cursor/rules", "skills", ".skills"];

    for (const path of candidates) {
      const resolved = await this.trySkillsDirectory(owner, repo, path, headers);
      if (resolved) {
        return resolved;
      }
    }

    throw new ServiceError(
      "source_invalid",
      `No skills directory found in ${owner}/${repo}. Expected one of: .cursor/rules, skills, .skills`
    );
  }

  private async trySkillsDirectory(
    owner: string,
    repo: string,
    path: string,
    headers: Record<string, string>
  ): Promise<string | null> {
    try {
      const response = await this.client.get<unknown>(`/repos/${owner}/${repo}/contents/${encodeRepoPath(path)}`, { headers });
      if (!Array.isArray(response.data)) {
        return null;
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

function encodeRepoPath(repoPath: string): string {
  return repoPath
    .split("/")
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
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
