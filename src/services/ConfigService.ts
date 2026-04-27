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
}
