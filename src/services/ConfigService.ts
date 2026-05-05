import * as vscode from "vscode";
import { ResolvedSource, SourceConfig, SourceMode } from "../types";
import { buildSourceFromLegacy, resolveSources } from "../utils/sources";

export const LEGACY_MIGRATION_FLAG = "skillSync.legacySourcesMigrated";

export class ConfigService {
  private get config(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration("skillSync");
  }

  /**
   * Multi-source: returns the configured `skillSync.sources` array. If empty,
   * falls back to synthesizing one entry from the legacy keys so freshly upgraded
   * workspaces continue to work until `migrateLegacySourcesIfNeeded()` runs.
   */
  public getSources(): SourceConfig[] {
    const stored = this.config.get<SourceConfig[]>("sources", []);
    if (Array.isArray(stored) && stored.length > 0) {
      return stored.filter((s) => s && typeof s.value === "string" && s.value.trim().length > 0);
    }
    return buildSourceFromLegacy(this.getSourceMode(), this.getSourceRepository(), this.getRegistryUrl());
  }

  public getResolvedSources(): ResolvedSource[] {
    return resolveSources(this.getSources());
  }

  public async setSources(sources: SourceConfig[]): Promise<void> {
    await this.config.update("sources", sources, vscode.ConfigurationTarget.Workspace);
  }

  public async addSource(source: SourceConfig): Promise<void> {
    const current = this.getSources();
    const isDuplicate = current.some(
      (s) => s.type === source.type && s.value.trim().toLowerCase() === source.value.trim().toLowerCase()
    );
    if (isDuplicate) {
      return;
    }
    await this.setSources([...current, source]);
  }

  public async removeSource(predicate: (source: SourceConfig) => boolean): Promise<boolean> {
    const current = this.getSources();
    const next = current.filter((s) => !predicate(s));
    if (next.length === current.length) {
      return false;
    }
    await this.setSources(next);
    return true;
  }

  /**
   * Idempotent: when `skillSync.sources` is empty and the legacy keys hold a
   * value, persist them as the first entry of the new array and clear the
   * legacy keys. Marks a global flag so subsequent activations are no-ops.
   *
   * Returns true when migration ran in this call.
   */
  public async migrateLegacySourcesIfNeeded(globalState: vscode.Memento): Promise<boolean> {
    if (globalState.get<boolean>(LEGACY_MIGRATION_FLAG, false)) {
      return false;
    }
    const stored = this.config.get<SourceConfig[]>("sources", []);
    if (Array.isArray(stored) && stored.length > 0) {
      await globalState.update(LEGACY_MIGRATION_FLAG, true);
      return false;
    }
    const synthesized = buildSourceFromLegacy(
      this.getSourceMode(),
      this.getSourceRepository(),
      this.getRegistryUrl()
    );
    if (synthesized.length === 0) {
      await globalState.update(LEGACY_MIGRATION_FLAG, true);
      return false;
    }
    await this.setSources(synthesized);
    await this.config.update("sourceRepository", undefined, vscode.ConfigurationTarget.Workspace);
    await this.config.update("registryUrl", undefined, vscode.ConfigurationTarget.Workspace);
    await globalState.update(LEGACY_MIGRATION_FLAG, true);
    return true;
  }

  /** Legacy: returns the deprecated single `skillSync.sourceMode` setting. */
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

  /**
   * Opted-in skills are stored as composite keys `<sourceLabel>/<name>` once a
   * workspace has been migrated to multi-source. The legacy bare-name format
   * is upgraded by `migrateOptedInSkillsIfNeeded`.
   */
  public getOptedInSkills(): string[] {
    return this.config.get<string[]>("optedInSkills", []);
  }

  public async setOptedInSkills(skills: string[]): Promise<void> {
    await this.config.update("optedInSkills", skills, vscode.ConfigurationTarget.Workspace);
  }

  /** True when at least one source is configured (multi-source aware). */
  public hasAnyConfiguredSource(): boolean {
    return this.getSources().length > 0;
  }

  /** Backwards-compatible alias kept for callers still expecting the old name. */
  public isSourceConfigured(): boolean {
    return this.hasAnyConfiguredSource();
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
