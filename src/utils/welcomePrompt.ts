import * as vscode from "vscode";
import type { ConfigService } from "../services/ConfigService";
import type { SyncEngine } from "../services/SyncEngine";

export const WELCOME_PROMPT_WORKSPACE_KEY = "skillSync.welcomePromptShown";

/**
 * One-time per workspace: invite the user to configure the skill source.
 * If dismissed or ignored, we do not show again for this workspace.
 */
export async function maybeShowConfigurePrompt(
  context: vscode.ExtensionContext,
  configService: ConfigService,
  syncEngine: SyncEngine
): Promise<void> {
  if (context.workspaceState.get<boolean>(WELCOME_PROMPT_WORKSPACE_KEY)) {
    return;
  }

  await context.workspaceState.update(WELCOME_PROMPT_WORKSPACE_KEY, true);

  const choice = await vscode.window.showInformationMessage(
    "Curate AI skills for this project. Connect a GitHub skills source to start syncing.",
    "Configure Skills",
    "Not Now"
  );

  if (choice === "Configure Skills") {
    await vscode.commands.executeCommand("skillSync.configureSource");
    if (configService.isSourceConfigured()) {
      await syncEngine.sync(true);
    }
  }
}
