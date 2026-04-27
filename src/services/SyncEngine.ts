import * as vscode from "vscode";
import { AuthService } from "./AuthService";
import { ConfigService } from "./ConfigService";
import { RepoService } from "./RepoService";
import { RegistryService } from "./RegistryService";
import { Logger } from "../utils/logger";
import { deleteSkillFile, listExistingSkillFiles, writeSkillFile } from "../utils/fileUtils";
import { SkillMeta, SyncFailureReason, SyncResult, SyncStatus } from "../types";
import { ServiceError } from "./ServiceError";
import { SkillCatalogStore, buildSourceKey } from "./SkillCatalogStore";

const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;

export class SyncEngine implements vscode.Disposable {
  private intervalHandle?: NodeJS.Timeout;
  private readonly skillShaCache = new Map<string, string>();
  private readonly syncEventEmitter = new vscode.EventEmitter<SyncResult>();
  private lastBackgroundFailureReason: SyncFailureReason = "none";
  private lastResult = this.createResult("skipped", "unknown", "Sync has not run yet.");
  private lastSyncTime?: Date;

  public constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
    private readonly repoService: RepoService,
    private readonly registryService: RegistryService,
    private readonly logger: Logger,
    private readonly catalogStore: SkillCatalogStore
  ) {}

  public readonly onSyncComplete = this.syncEventEmitter.event;

  public startScheduler(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
    }
    this.intervalHandle = setInterval(() => {
      this.sync(false).catch((error: unknown) => {
        this.logger.error("Scheduled sync failed", error);
      });
    }, FOUR_HOURS_MS);
  }

  public getLastSyncTime(): Date | undefined {
    return this.lastSyncTime;
  }

  public getLastResult(): SyncResult {
    return this.lastResult;
  }

  public async sync(isManual: boolean): Promise<SyncResult> {
    const result = this.createResult("skipped", "unknown", "Sync did not run.");

    try {
      const token = await this.authService.getToken(isManual);
      if (!token) {
        result.reason = "no_session";
        result.message = isManual
          ? "No GitHub session is available. Sign in and try again."
          : "No GitHub session available; background sync skipped.";
        this.logger.warn(result.message);
        this.emitResult(result, isManual);
        return result;
      }
    } catch (error) {
      const authError = this.toReasonAndMessage(error, "Authentication failed.");
      result.status = "failed";
      result.reason = authError.reason;
      result.message = authError.message;
      result.errors.push(authError.message);
      this.logger.error("Auth failed during sync", error);
      this.emitResult(result, isManual);
      return result;
    }

    const optedInSkills = this.configService.getOptedInSkills();
    const sourceMode = this.configService.getSourceMode();

    try {
      const skillIndex = sourceMode === "github-repo"
        ? await this.getGithubSkills()
        : await this.registryService.listSkills();

      const indexByName = new Map(skillIndex.map((skill) => [skill.name, skill]));

      for (const skillName of optedInSkills) {
        const meta = indexByName.get(skillName);
        if (!meta || !meta.path) {
          result.errors.push(`Skill ${skillName} not found in upstream.`);
          continue;
        }

        const previousSha = this.skillShaCache.get(skillName);
        if (previousSha === meta.shaOrVersion) {
          continue;
        }

        const content = sourceMode === "github-repo"
          ? await this.getGithubSkillContent(meta.path)
          : await this.registryService.getSkillContent(meta.path);
        await writeSkillFile(skillName, content.content);
        this.skillShaCache.set(skillName, content.shaOrVersion);
        result.updated.push(skillName);
      }

      const existingFiles = await listExistingSkillFiles();
      const optedInSet = new Set(optedInSkills);
      for (const fileSkillName of existingFiles) {
        if (!optedInSet.has(fileSkillName)) {
          await deleteSkillFile(fileSkillName);
          result.deleted.push(fileSkillName);
          this.skillShaCache.delete(fileSkillName);
        }
      }

      this.lastSyncTime = new Date();
      result.timestamp = this.lastSyncTime.toISOString();
      if (result.errors.length > 0) {
        result.status = result.updated.length > 0 || result.deleted.length > 0 ? "partial" : "failed";
        result.reason = "unknown";
        result.message = "Sync completed with errors.";
      } else {
        result.status = "success";
        result.reason = "none";
        result.message = result.updated.length > 0 || result.deleted.length > 0
          ? "Skills synced successfully."
          : "Skills are already up to date.";
      }

      if (!isManual && result.updated.length > 0) {
        const selection = await vscode.window.showInformationMessage(
          "Agent skills updated in the background.",
          "View Changes"
        );
        if (selection === "View Changes") {
          await vscode.commands.executeCommand("workbench.view.scm");
        }
      }
    } catch (error) {
      const syncError = this.toReasonAndMessage(error, "Sync failed unexpectedly.");
      result.status = result.updated.length > 0 || result.deleted.length > 0 ? "partial" : "failed";
      result.reason = syncError.reason;
      result.message = syncError.message;
      result.errors.push(syncError.message);
      this.logger.error("Sync failed", error);
    }

    this.emitResult(result, isManual);
    return result;
  }

  public async syncSingle(skillName: string, optIn: boolean): Promise<SyncResult> {
    if (!optIn) {
      await deleteSkillFile(skillName);
      this.skillShaCache.delete(skillName);
      const result = this.createResult("success", "none", `Disabled ${skillName}.`);
      result.deleted.push(skillName);
      this.emitResult(result, true);
      return result;
    }

    const result = await this.sync(true);
    if (result.status !== "success" && result.status !== "partial") {
      result.message = `Failed to enable ${skillName}. ${result.message}`;
    }
    return result;
  }

  private async getGithubSkills(): Promise<SkillMeta[]> {
    const repoRef = this.configService.getSourceRepository();
    const parsed = this.parseGithubRepoRef(repoRef);
    const owner = parsed?.owner;
    const repo = parsed?.repo;
    if (!owner || !repo) {
      throw new Error("skillSync.sourceRepository must be set as owner/repository.");
    }
    const sourceKey = buildSourceKey("github-repo", repoRef, "");
    const cached = this.catalogStore.load(sourceKey);
    if (cached && cached.metas.length > 0) {
      return cached.metas;
    }
    const metas = await this.repoService.listSkillsInRepo(owner, repo);
    const root = await this.repoService.resolveSkillsRootPath(owner, repo);
    this.catalogStore.save(sourceKey, root, metas);
    return metas;
  }

  private async getGithubSkillContent(path: string) {
    const repoRef = this.configService.getSourceRepository();
    const parsed = this.parseGithubRepoRef(repoRef);
    const owner = parsed?.owner;
    const repo = parsed?.repo;
    if (!owner || !repo) {
      throw new Error("skillSync.sourceRepository must be set as owner/repository.");
    }
    return this.repoService.getSkillContent(owner, repo, path);
  }

  private parseGithubRepoRef(repoRef: string): { owner: string; repo: string } | null {
    const trimmed = repoRef.trim();
    const sshMatch = trimmed.match(/[:/]([^/\s:]+)\/([^/\s]+?)(?:\.git)?$/);
    if (sshMatch) {
      return {
        owner: sshMatch[1],
        repo: sshMatch[2]
      };
    }

    const parts = trimmed.split("/").filter(Boolean);
    if (parts.length === 2) {
      return {
        owner: parts[0],
        repo: parts[1].replace(/\.git$/i, "")
      };
    }

    return null;
  }

  public dispose(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
    }
    this.syncEventEmitter.dispose();
  }

  private createResult(status: SyncStatus, reason: SyncFailureReason, message: string): SyncResult {
    return {
      status,
      reason,
      message,
      timestamp: new Date().toISOString(),
      updated: [],
      deleted: [],
      errors: []
    };
  }

  private toReasonAndMessage(error: unknown, fallbackMessage: string): { reason: SyncFailureReason; message: string } {
    if (error instanceof ServiceError) {
      return {
        reason: error.reason,
        message: error.message
      };
    }

    if (error instanceof Error) {
      return {
        reason: "unknown",
        message: error.message
      };
    }

    return {
      reason: "unknown",
      message: fallbackMessage
    };
  }

  private emitResult(result: SyncResult, isManual: boolean): void {
    this.lastResult = result;
    this.syncEventEmitter.fire(result);
    if (isManual) {
      return;
    }

    if (result.status === "failed" || result.status === "partial" || result.reason === "no_session") {
      if (this.lastBackgroundFailureReason === result.reason) {
        return;
      }
      this.lastBackgroundFailureReason = result.reason;
      void vscode.window.showWarningMessage(
        `Skill sync needs attention: ${result.message}`,
        "View Logs"
      ).then((choice) => {
        if (choice === "View Logs") {
          this.logger.show();
        }
      });
      return;
    }

    this.lastBackgroundFailureReason = "none";
  }
}
