import * as vscode from "vscode";
import { SourceMode } from "../types";

export class ConfigService {
  private get config(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration("skillSync");
  }

  public getSourceMode(): SourceMode {
    return this.config.get<SourceMode>("sourceMode", "github-repo");
  }

  public async setSourceMode(mode: SourceMode): Promise<void> {
    await this.config.update("sourceMode", mode, vscode.ConfigurationTarget.Workspace);
  }

  public getSourceRepository(): string {
    return this.config.get<string>("sourceRepository", "");
  }

  public async setSourceRepository(repo: string): Promise<void> {
    await this.config.update("sourceRepository", repo, vscode.ConfigurationTarget.Workspace);
  }

  public getRegistryUrl(): string {
    return this.config.get<string>("registryUrl", "");
  }

  public async setRegistryUrl(url: string): Promise<void> {
    await this.config.update("registryUrl", url, vscode.ConfigurationTarget.Workspace);
  }

  public getCategories(): string[] {
    return this.config.get<string[]>("categories", []);
  }

  public getOptedInSkills(): string[] {
    return this.config.get<string[]>("optedInSkills", []);
  }

  public async setOptedInSkills(skills: string[]): Promise<void> {
    await this.config.update("optedInSkills", skills, vscode.ConfigurationTarget.Workspace);
  }

  /** True when the active source mode has the minimum settings needed to fetch skills. */
  public isSourceConfigured(): boolean {
    const mode = this.getSourceMode();
    if (mode === "github-repo") {
      return this.getSourceRepository().trim().length > 0;
    }
    return this.getRegistryUrl().trim().length > 0;
  }

  public getRecommendationsUseLlm(): boolean {
    return this.config.get<boolean>("recommendations.useLanguageModel", true);
  }

  public getRecommendationsModelFamily(): string {
    return this.config.get<string>("recommendations.modelFamily", "gpt-4o");
  }

  public getRecommendationsCacheTtlMinutes(): number {
    return this.config.get<number>("recommendations.cacheTtlMinutes", 1440);
  }

  public getRecommendationsCursorSdkModel(): string {
    return this.config.get<string>("recommendations.cursorSdkModel", "composer-2");
  }

  public getRecommendationsOpenAiModel(): string {
    return this.config.get<string>("recommendations.openAiModel", "gpt-4o-mini");
  }

  public getRecommendationsAnthropicModel(): string {
    return this.config.get<string>("recommendations.anthropicModel", "claude-3-5-haiku-20241022");
  }
}
