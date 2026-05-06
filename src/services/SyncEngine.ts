import * as vscode from "vscode";
import { AuthService } from "./AuthService";
import { ConfigService } from "./ConfigService";
import { Logger } from "../utils/logger";
import {
  deleteSkillFile,
  deleteSkillPackage,
  ExistingSkillFile,
  ExistingSkillPackage,
  listExistingSkillFiles,
  listExistingSkillPackages,
  normalizeSkillName,
  writeSkillFile,
  writeSkillPackageFile
} from "../utils/fileUtils";
import { ResolvedSource, SkillMeta, SyncFailureReason, SyncResult, SyncStatus } from "../types";
import { ServiceError } from "./ServiceError";
import { CatalogService } from "./CatalogService";
import { MultiSourceCatalogService } from "./MultiSourceCatalogService";
import { writeWorkspaceCatalogManifest } from "../utils/catalogManifest";
import { compositeSkillKey, parseCompositeSkillKey } from "../utils/sources";
import { formatStaleSources } from "../utils/staleSources";

const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;

export class SyncEngine implements vscode.Disposable {
  private intervalHandle?: NodeJS.Timeout;
  /** Composite key (`<sourceLabel>/<name>`) → last synced sha. Source-scoped via the label prefix. */
  private readonly skillShaCache = new Map<string, string>();
  private readonly syncEventEmitter = new vscode.EventEmitter<SyncResult>();
  private lastBackgroundFailureReason: SyncFailureReason = "none";
  /** Sentinel string for the dedupe of stale-cache toasts in background syncs. */
  private lastBackgroundStaleSignature = "";
  private lastResult = this.createResult("skipped", "unknown", "Sync has not run yet.");
  private lastSyncTime?: Date;

  public constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
    private readonly logger: Logger,
    private readonly catalogService: CatalogService,
    private readonly multiSourceService: MultiSourceCatalogService
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

    if (!isManual && !this.configService.hasAnyConfiguredSource()) {
      result.reason = "source_invalid";
      result.message = "Skill source is not configured; background sync skipped.";
      this.emitResult(result, isManual);
      return result;
    }

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

    const sources = this.configService.getResolvedSources();
    const optedIn = this.configService.getOptedInSkills();
    let mergedMetasForManifest: SkillMeta[] | undefined;
    const firstSource: ResolvedSource | undefined = sources[0];

    try {
      const merged = await this.multiSourceService.getMergedCatalog(sources, { forceRefresh: isManual });
      mergedMetasForManifest = merged.metas;

      // Track whether any source needs auth so we can surface the most
      // actionable failure reason later (instead of a generic "unknown").
      let firstAuthReason: SyncFailureReason | undefined;
      let firstAuthMessage: string | undefined;
      for (const perSource of merged.perSource) {
        if (perSource.error) {
          result.errors.push(`Source ${perSource.source.label} failed: ${perSource.error}`);
          if (
            !firstAuthReason &&
            (perSource.errorReason === "auth_expired" || perSource.errorReason === "no_session")
          ) {
            firstAuthReason = perSource.errorReason;
            firstAuthMessage = perSource.error;
          }
        }
        if (perSource.stale) {
          result.staleSources.push({
            label: perSource.source.label,
            reason: perSource.staleReason ?? "unknown",
            retryAt: perSource.retryAt
          });
        }
      }

      const sourceByLabel = new Map(sources.map((s) => [s.label, s]));
      const discoveryOnlyLabels = new Set(
        sources.filter((s) => s.type === "official-skills" || s.type === "open-skills").map((s) => s.label)
      );
      const targets = resolveOptedInTargets(optedIn, merged.byCompositeKey, sources);

      for (const target of targets) {
        if (target.meta?.isDiscoveryOnly) {
          result.errors.push(
            `Skill ${target.compositeKey} is from a discovery-only source — enable it from the Skill Manager to add its GitHub repository.`
          );
          continue;
        }
        if (!target.meta || !target.meta.path) {
          result.errors.push(`Skill ${target.compositeKey} not found in upstream.`);
          continue;
        }
        const source = target.meta.source ? sourceByLabel.get(target.meta.source.label) : sourceByLabel.get(target.label);
        if (!source) {
          result.errors.push(`Source for skill ${target.compositeKey} is no longer configured.`);
          continue;
        }

        const previousSha = this.skillShaCache.get(target.compositeKey);
        if (previousSha === target.meta.shaOrVersion) {
          continue;
        }

        try {
          if (target.meta.skillType === "skill") {
            await this.syncSkillPackage(target.meta, source, target.compositeKey, result);
          } else {
            const content = await this.catalogService.getContent(source.sourceKey, target.meta.path);
            await writeSkillFile(source.label, target.meta.name, content.content);
            this.skillShaCache.set(target.compositeKey, content.shaOrVersion);
            result.updated.push(target.compositeKey);
          }
        } catch (itemError) {
          const msg = itemError instanceof Error ? itemError.message : String(itemError);
          result.errors.push(`Failed to sync ${target.compositeKey}: ${msg}`);
          this.logger.error(`Failed to sync ${target.compositeKey}`, itemError);
        }
      }

      // Compute the set of currently-wanted on-disk identities (label, normalized name)
      // so we can prune anything that is no longer opted-in.
      const wanted = new Set<string>();
      for (const target of targets) {
        if (!target.meta || target.meta.isDiscoveryOnly) {
          continue;
        }
        try {
          wanted.add(`${target.label}|${normalizeSkillName(target.meta.name)}`);
        } catch {
          // ignore invalid names
        }
      }

      const existingFiles: ExistingSkillFile[] = await listExistingSkillFiles();
      for (const entry of existingFiles) {
        if (!entry.label) {
          // Loose flat-layout file lingering from a failed migration; leave it alone.
          continue;
        }
        if (discoveryOnlyLabels.has(entry.label)) {
          continue;
        }
        const key = `${entry.label}|${entry.name}`;
        if (!wanted.has(key)) {
          await deleteSkillFile(entry.label, entry.name);
          const composite = compositeSkillKey(entry.label, entry.name);
          result.deleted.push(composite);
          this.skillShaCache.delete(composite);
        }
      }

      const existingPackages: ExistingSkillPackage[] = await listExistingSkillPackages();
      for (const entry of existingPackages) {
        if (!entry.label) {
          continue;
        }
        if (discoveryOnlyLabels.has(entry.label)) {
          continue;
        }
        const key = `${entry.label}|${entry.name}`;
        if (!wanted.has(key)) {
          await deleteSkillPackage(entry.label, entry.name);
          const composite = compositeSkillKey(entry.label, entry.name);
          if (!result.deleted.includes(composite)) {
            result.deleted.push(composite);
          }
          this.skillShaCache.delete(composite);
        }
      }

      this.lastSyncTime = new Date();
      result.timestamp = this.lastSyncTime.toISOString();
      if (result.errors.length > 0) {
        result.status = result.updated.length > 0 || result.deleted.length > 0 ? "partial" : "failed";
        if (firstAuthReason) {
          // Surface auth as the headline reason so the UI can offer a Sign In
          // button instead of a generic "View Logs" prompt.
          result.reason = firstAuthReason;
          result.message = firstAuthMessage ?? "GitHub authorization required.";
        } else {
          result.reason = "unknown";
          result.message = "Sync completed with errors.";
        }
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

    if (
      mergedMetasForManifest &&
      mergedMetasForManifest.length > 0 &&
      (result.status === "success" || result.status === "partial") &&
      firstSource
    ) {
      void writeWorkspaceCatalogManifest(sources, mergedMetasForManifest);
    }

    this.emitResult(result, isManual);
    return result;
  }

  public async syncSingle(skillIdentifier: string, optIn: boolean): Promise<SyncResult> {
    if (!optIn) {
      const sources = this.configService.getResolvedSources();
      const parsed = parseCompositeSkillKey(skillIdentifier);
      const candidates: Array<{ label: string; name: string }> = parsed
        ? [parsed]
        : sources.map((s) => ({ label: s.label, name: skillIdentifier }));

      for (const { label, name } of candidates) {
        await deleteSkillFile(label, name);
        await deleteSkillPackage(label, name);
        this.skillShaCache.delete(compositeSkillKey(label, name));
      }
      const result = this.createResult("success", "none", `Disabled ${skillIdentifier}.`);
      result.deleted.push(skillIdentifier);
      this.emitResult(result, true);
      return result;
    }

    const result = await this.sync(true);
    if (result.status !== "success" && result.status !== "partial") {
      result.message = `Failed to enable ${skillIdentifier}. ${result.message}`;
    }
    return result;
  }

  private async syncSkillPackage(
    meta: SkillMeta,
    source: ResolvedSource,
    compositeKey: string,
    result: SyncResult
  ): Promise<void> {
    const files = meta.skillFiles ?? [];
    const skillName = meta.name;

    if (files.length === 0) {
      this.logger.warn(`Skill package ${compositeKey} has no files listed; skipping.`);
      return;
    }

    const packageDirPath = meta.path ?? "";

    for (const filePath of files) {
      // relativePath = portion after the package directory
      const relPath = filePath.startsWith(`${packageDirPath}/`)
        ? filePath.slice(packageDirPath.length + 1)
        : filePath.split("/").pop() ?? filePath;

      const content = await this.catalogService.getContent(source.sourceKey, filePath);

      await writeSkillPackageFile(source.label, skillName, relPath, content.content);
    }

    this.skillShaCache.set(compositeKey, meta.shaOrVersion);
    result.updated.push(compositeKey);
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
      errors: [],
      staleSources: []
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
      // Auth-related failures get a Sign In button so the user can recover
      // straight from the notification instead of digging through the logs.
      const needsAuth = result.reason === "no_session" || result.reason === "auth_expired";
      const actions = needsAuth ? ["Sign In", "View Logs"] : ["View Logs"];
      void vscode.window
        .showWarningMessage(`Skill sync needs attention: ${result.message}`, ...actions)
        .then((choice) => {
          if (choice === "Sign In") {
            void vscode.commands.executeCommand("skillSync.signIn");
          }
          if (choice === "View Logs") {
            this.logger.show();
          }
        });
      return;
    }

    this.lastBackgroundFailureReason = "none";

    // Successful sync that fell back to cached catalogs — let the user know
    // once per condition (so we don't re-toast every 4h while rate-limited).
    if (result.staleSources.length > 0) {
      const signature = this.staleSignature(result);
      if (signature !== this.lastBackgroundStaleSignature) {
        this.lastBackgroundStaleSignature = signature;
        void vscode.window
          .showWarningMessage(
            `Skill sync used cached catalog for ${formatStaleSources(result.staleSources)}.`,
            "View Logs"
          )
          .then((choice) => {
            if (choice === "View Logs") {
              this.logger.show();
            }
          });
      }
      return;
    }

    this.lastBackgroundStaleSignature = "";
  }

  private staleSignature(result: SyncResult): string {
    return result.staleSources
      .map((s) => `${s.label}|${s.reason}|${s.retryAt ?? ""}`)
      .sort()
      .join(",");
  }
}

interface OptedInTarget {
  compositeKey: string;
  label: string;
  name: string;
  meta?: SkillMeta;
}

/**
 * Resolve persisted opted-in identifiers (composite keys after migration, or
 * bare names from older configs) into composite-keyed targets. Bare names are
 * matched against any source that exposes them; if multiple sources do, the
 * first wins to keep behavior deterministic.
 */
function resolveOptedInTargets(
  optedIn: string[],
  byCompositeKey: Map<string, SkillMeta>,
  sources: ResolvedSource[]
): OptedInTarget[] {
  const targets: OptedInTarget[] = [];
  const seen = new Set<string>();

  for (const entry of optedIn) {
    const parsed = parseCompositeSkillKey(entry);
    if (parsed) {
      const compositeKey = entry;
      if (seen.has(compositeKey)) {
        continue;
      }
      seen.add(compositeKey);
      targets.push({
        compositeKey,
        label: parsed.label,
        name: parsed.name,
        meta: byCompositeKey.get(compositeKey)
      });
      continue;
    }

    let matched = false;
    for (const source of sources) {
      const compositeKey = compositeSkillKey(source.label, entry);
      const meta = byCompositeKey.get(compositeKey);
      if (meta) {
        if (seen.has(compositeKey)) {
          continue;
        }
        seen.add(compositeKey);
        targets.push({
          compositeKey,
          label: source.label,
          name: entry,
          meta
        });
        matched = true;
        break;
      }
    }
    if (!matched && sources.length > 0) {
      const fallbackLabel = sources[0].label;
      const compositeKey = compositeSkillKey(fallbackLabel, entry);
      if (!seen.has(compositeKey)) {
        seen.add(compositeKey);
        targets.push({ compositeKey, label: fallbackLabel, name: entry });
      }
    }
  }

  return targets;
}
