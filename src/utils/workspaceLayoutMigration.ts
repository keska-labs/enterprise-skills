import * as vscode from "vscode";
import { ConfigService } from "../services/ConfigService";
import { migrateLegacyWorkspaceLayout } from "./fileUtils";
import { Logger } from "./logger";

export const WORKSPACE_LAYOUT_MIGRATION_FLAG = "skillSync.workspaceLayoutMigrated";

/**
 * One-shot per workspace migration of the on-disk layout from
 * `.cursor/rules/<name>.mdc` → `.cursor/rules/<label>/<name>.mdc` and
 * `.cursor/skills/<name>/` → `.cursor/skills/<label>/<name>/`.
 *
 * Only runs when the workspace has exactly one configured source so we can
 * unambiguously attribute the existing flat files. Multi-source workspaces
 * skip migration; the next sync simply rewrites into the labelled folders.
 */
export async function migrateWorkspaceLayoutIfNeeded(
  configService: ConfigService,
  workspaceState: vscode.Memento,
  logger: Logger
): Promise<boolean> {
  if (workspaceState.get<boolean>(WORKSPACE_LAYOUT_MIGRATION_FLAG, false)) {
    return false;
  }
  const sources = configService.getResolvedSources();
  if (sources.length !== 1) {
    return false;
  }
  try {
    const moved = await migrateLegacyWorkspaceLayout(sources[0].label);
    if (moved.movedFiles > 0 || moved.movedPackages > 0) {
      logger.log(
        `Migrated ${moved.movedFiles} flat rule(s) and ${moved.movedPackages} flat skill package(s) to .cursor/rules/${sources[0].label}/ and .cursor/skills/${sources[0].label}/.`
      );
    }
    await workspaceState.update(WORKSPACE_LAYOUT_MIGRATION_FLAG, true);
    return true;
  } catch (error) {
    logger.error("Workspace layout migration failed", error);
    return false;
  }
}
