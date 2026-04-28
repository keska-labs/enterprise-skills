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

  /** GA4 Measurement ID (`G-XXXXXXXX`) or empty to disable webview analytics. */
  public getGa4MeasurementId(): string {
    return this.config.get<string>("ga4MeasurementId", "").trim();
  }

  /**
   * When true, GA4 may load with only a valid Measurement ID, without requiring
   * `vscode.env.isTelemetryEnabled`.
   */
  public getGa4AllowWithoutProductTelemetry(): boolean {
    return Boolean(this.config.get<boolean>("ga4AllowWithoutProductTelemetry", false));
  }
}
