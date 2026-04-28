import axios, { AxiosInstance } from "axios";
import { AuthService } from "./AuthService";
import { ConfigService } from "./ConfigService";
import { SkillContent, SkillMeta } from "../types";
import { ServiceError, toServiceError } from "./ServiceError";

interface RegistrySkill {
  id: string;
  name: string;
  description?: string;
  version: string;
  category?: string;
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

  private get registryUrl(): string {
    const url = this.configService.getRegistryUrl();
    if (!url) {
      throw new ServiceError("source_invalid", "skillSync.registryUrl is not configured.");
    }
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new ServiceError("source_invalid", "skillSync.registryUrl must be a valid URL.");
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

  public async listSkills(): Promise<SkillMeta[]> {
    try {
      const headers = await this.getAuthHeaders();
      const response = await this.client.get<RegistrySkill[]>(`${this.registryUrl}/skills`, { headers });
      return response.data.map((skill) => ({
        name: skill.name,
        description: skill.description,
        version: skill.version,
        category: skill.category ?? "Uncategorized",
        shaOrVersion: skill.version,
        path: skill.id,
        skillType: "cursor-rule" as const  // registry skills are single-file rules
      }));
    } catch (error) {
      throw toServiceError(error, "Failed to load skills from the custom registry.");
    }
  }

  public async getSkillContent(id: string): Promise<SkillContent> {
    try {
      const headers = await this.getAuthHeaders();
      const response = await this.client.get<{ content: string; version: string }>(`${this.registryUrl}/skills/${id}/content`, { headers });
      return {
        content: response.data.content,
        shaOrVersion: response.data.version
      };
    } catch (error) {
      throw toServiceError(error, `Failed to load registry skill content for ${id}.`);
    }
  }
}
