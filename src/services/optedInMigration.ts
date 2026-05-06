import * as vscode from "vscode";
import { ConfigService } from "./ConfigService";
import { compositeSkillKey, isComposite } from "../utils/sources";

export const OPTED_IN_MIGRATION_FLAG = "skillSync.optedInSkillsMigrated";

/**
 * Rewrites the persisted `skillSync.optedInSkills` from the legacy bare-name
 * shape (`["foo-skill"]`) to the multi-source composite shape
 * (`["<sourceLabel>/foo-skill"]`). Only runs when:
 *   - the migration has not run for this workspace before, AND
 *   - the workspace has exactly one configured source to attribute names to.
 *
 * Multi-source workspaces leave the bare names intact; the orchestrator will
 * resolve them on demand the first time the user toggles a row.
 */
export async function migrateOptedInSkillsIfNeeded(
  configService: ConfigService,
  workspaceState: vscode.Memento
): Promise<boolean> {
  if (workspaceState.get<boolean>(OPTED_IN_MIGRATION_FLAG, false)) {
    return false;
  }

  const opted = configService.getOptedInSkills();
  if (opted.length === 0) {
    await workspaceState.update(OPTED_IN_MIGRATION_FLAG, true);
    return false;
  }

  const sources = configService.getResolvedSources();
  if (sources.length !== 1) {
    return false;
  }

  const label = sources[0].label;
  const upgraded = opted.map((entry) => (isComposite(entry) ? entry : compositeSkillKey(label, entry)));

  if (upgraded.every((value, index) => value === opted[index])) {
    await workspaceState.update(OPTED_IN_MIGRATION_FLAG, true);
    return false;
  }

  await configService.setOptedInSkills(upgraded);
  await workspaceState.update(OPTED_IN_MIGRATION_FLAG, true);
  return true;
}
