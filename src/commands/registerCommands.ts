import * as vscode from "vscode";
import { AuthService } from "../services/AuthService";
import { ConfigService } from "../services/ConfigService";
import { RepoService } from "../services/RepoService";
import { SyncEngine } from "../services/SyncEngine";
import { Logger } from "../utils/logger";
import { RepoInfo, SyncResult } from "../types";

export async function configureSource(
  authService: AuthService,
  configService: ConfigService,
  repoService: RepoService,
  syncEngine: SyncEngine,
  logger: Logger
): Promise<void> {
  const session = await authService.getSession(true);
  if (!session?.accessToken) {
    vscode.window.showErrorMessage("GitHub sign-in is required to select a repository.");
    return;
  }

  let repos: RepoInfo[];
  try {
    repos = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Fetching GitHub repositories..."
      },
      async () => {
        const [userRepos, orgs] = await Promise.all([
          repoService.listUserRepos(),
          repoService.listUserOrgs()
        ]);
        const orgRepos = await Promise.all(orgs.map((org) => repoService.listOrgRepos(org)));
        const all = [...userRepos, ...orgRepos.flat()];
        const unique = new Map<string, RepoInfo>();
        all.forEach((repo) => unique.set(repo.fullName, repo));
        return [...unique.values()].sort((a, b) => a.fullName.localeCompare(b.fullName));
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Failed to fetch repositories", error);
    vscode.window.showErrorMessage(`Unable to load repositories: ${message}`);
    return;
  }

  const selected = await vscode.window.showQuickPick(
    repos.map((repo) => ({
      label: repo.fullName,
      description: repo.description,
      detail: repo.private ? "Private repository" : "Public repository"
    })),
    { placeHolder: "Select a skills source repository (owner/repo)" }
  );

  if (!selected) {
    return;
  }

  await configService.setSourceMode("github-repo");
  await configService.setSourceRepository(selected.label);
  logger.log(`Connected to repository ${selected.label}`);
  vscode.window.showInformationMessage(`Connected to ${selected.label}. Running initial sync...`);
  const syncResult = await syncEngine.sync(true);
  showSyncOutcome(syncResult, logger, "Initial sync");
}

export function registerCommands(
  context: vscode.ExtensionContext,
  authService: AuthService,
  configService: ConfigService,
  repoService: RepoService,
  syncEngine: SyncEngine,
  logger: Logger,
  focusSkillSidebar: () => void
): vscode.Disposable[] {
  const disposables: vscode.Disposable[] = [];

  disposables.push(
    vscode.commands.registerCommand("skillSync.manageSkills", () => {
      focusSkillSidebar();
    })
  );

  disposables.push(
    vscode.commands.registerCommand("skillSync.focusSidebar", () => {
      focusSkillSidebar();
    })
  );

  disposables.push(
    vscode.commands.registerCommand("skillSync.configureSource", async () => {
      await configureSource(authService, configService, repoService, syncEngine, logger);
    })
  );

  disposables.push(
    vscode.commands.registerCommand("skillSync.syncNow", async () => {
      const syncResult = await syncEngine.sync(true);
      showSyncOutcome(syncResult, logger, "Sync");
    })
  );

  context.subscriptions.push(...disposables);
  return disposables;
}

function showSyncOutcome(result: SyncResult, logger: Logger, label: string): void {
  if (result.status === "success") {
    vscode.window.showInformationMessage(`${label} completed. ${result.message}`);
    return;
  }

  if (result.status === "partial") {
    void vscode.window.showWarningMessage(`${label} completed with issues.`, "View Logs").then((choice) => {
      if (choice === "View Logs") {
        logger.show();
      }
    });
    return;
  }

  if (result.reason === "no_session" || result.reason === "auth_expired") {
    void vscode.window.showWarningMessage(`${label} requires GitHub sign-in.`, "Sign In", "View Logs").then((choice) => {
      if (choice === "Sign In") {
        void vscode.authentication.getSession("github", ["read:org", "repo"], { createIfNone: true });
      }
      if (choice === "View Logs") {
        logger.show();
      }
    });
    return;
  }

  void vscode.window.showErrorMessage(`${label} failed: ${result.message}`, "View Logs").then((choice) => {
    if (choice === "View Logs") {
      logger.show();
    }
  });
}
