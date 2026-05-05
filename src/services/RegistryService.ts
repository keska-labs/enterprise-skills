import axios, { AxiosInstance } from "axios";
import { AuthService } from "./AuthService";
import { ConfigService } from "./ConfigService";
import { SkillContent, SkillMeta, SkillTriggers } from "../types";
import { ServiceError, toServiceError } from "./ServiceError";

interface RegistrySkill {
  id: string;
  name: string;
  description?: string;
  version: string;
  category?: string;
  triggers?: SkillTriggers;
}

export class RegistryService {
  private readonly client: AxiosInstance;
  private static readonly LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

  public constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService
  ) {
    this.client = axios.create({ timeout: 15000 });
  }

  /**
   * Resolve the base registry URL.
   *
   * `explicitUrl` is the per-source URL coming from `skillSync.sources[].value`
   * (multi-source flow). When omitted, we fall back to the deprecated
   * `skillSync.registryUrl` config key for backwards compatibility — this only
   * matters when callers haven't migrated to the per-source orchestrator yet.
   */
  private resolveRegistryUrl(explicitUrl?: string): string {
    const raw = explicitUrl?.trim() || this.configService.getRegistryUrl();
    if (!raw) {
      throw new ServiceError("source_invalid", "Custom registry URL is not configured.");
    }
    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      throw new ServiceError("source_invalid", `Custom registry URL is not a valid URL: ${raw}`);
    }

    const isLocalhost = RegistryService.LOCAL_HOSTS.has(parsed.hostname);
    if (parsed.protocol !== "https:" && !(isLocalhost && parsed.protocol === "http:")) {
      throw new ServiceError(
        "source_invalid",
        "Custom registry must use https (http is only allowed for localhost)."
      );
    }

    return parsed.toString().replace(/\/$/, "");
  }

  private async getAuthHeaders(): Promise<Record<string, string>> {
    const token = await this.authService.getToken(false);
    if (!token) {
      throw new ServiceError("no_session", "No GitHub session is available.");
    }
    return { Authorization: `Bearer ${token}` };
  }

  public async listSkills(registryUrl?: string): Promise<SkillMeta[]> {
    const baseUrl = this.resolveRegistryUrl(registryUrl);
    try {
      const headers = await this.getAuthHeaders();
      const response = await this.client.get<RegistrySkill[]>(`${baseUrl}/skills`, { headers });
      return response.data.map((skill) => ({
        name: skill.name,
        description: skill.description,
        version: skill.version,
        category: skill.category ?? "Uncategorized",
        shaOrVersion: skill.version,
        path: skill.id,
        skillType: "cursor-rule" as const, // registry skills are single-file rules
        triggers: skill.triggers
      }));
    } catch (error) {
      throw toServiceError(error, "Failed to load skills from the custom registry.");
    }
  }

  public async getSkillContent(id: string, registryUrl?: string): Promise<SkillContent> {
    const baseUrl = this.resolveRegistryUrl(registryUrl);
    try {
      const headers = await this.getAuthHeaders();
      const response = await this.client.get<{ content: string; version: string }>(`${baseUrl}/skills/${id}/content`, { headers });
      return {
        content: response.data.content,
        shaOrVersion: response.data.version
      };
    } catch (error) {
      throw toServiceError(error, `Failed to load registry skill content for ${id}.`);
    }
  }
}
