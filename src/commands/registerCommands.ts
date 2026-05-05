import * as vscode from "vscode";
import { AuthService } from "../services/AuthService";
import { ConfigService } from "../services/ConfigService";
import { RepoService } from "../services/RepoService";
import { SyncEngine } from "../services/SyncEngine";
import { SkillCatalogStore } from "../services/SkillCatalogStore";
import { Logger } from "../utils/logger";
import { RepoInfo, SourceConfig, SyncResult } from "../types";
import { RECOMMENDATION_SECRET_KEYS } from "../constants/recommendationSecrets";
import { deriveSourceLabel, sourceTypeLabel } from "../utils/sources";
import {
  deleteSkillFile,
  deleteSkillPackage,
  listExistingSkillFiles,
  listExistingSkillPackages
} from "../utils/fileUtils";

/**
 * Append a new skill source. Walks the user through type selection, fetches
 * any inputs the type needs (GitHub repo via quick-pick, registry URL via
 * input box), and triggers an initial sync. Existing sources are preserved.
 */
export async function configureSource(
  authService: AuthService,
  configService: ConfigService,
  repoService: RepoService,
  syncEngine: SyncEngine,
  logger: Logger
): Promise<void> {
  const sourceTypePick = await vscode.window.showQuickPick(
    [
      { label: "GitHub repository", description: "Sync skills from a GitHub repo (owner/repo)", value: "github-repo" as const },
      { label: "Custom registry", description: "Sync skills from an HTTPS registry URL", value: "custom-registry" as const }
    ],
    { placeHolder: "Choose a skill source type to add" }
  );

  if (!sourceTypePick) {
    return;
  }

  if (sourceTypePick.value === "github-repo") {
    await addGithubSource(authService, configService, repoService, syncEngine, logger);
    return;
  }

  await addRegistrySource(configService, syncEngine, logger);
}

interface RepoPickItem extends vscode.QuickPickItem {
  fullName: string;
  /** True for the synthetic "use what you typed as a public repo" item. */
  isManual?: boolean;
}

async function addGithubSource(
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

  const fullName = await pickGithubRepo(repos, repoService, logger);
  if (!fullName) {
    return;
  }

  const source: SourceConfig = { type: "github-repo", value: fullName };
  const label = await promptForLabel(source);
  if (label !== undefined && label.length > 0) {
    source.label = label;
  }

  await configService.addSource(source);
  logger.log(`Added GitHub source ${fullName}`);
  vscode.window.showInformationMessage(`Added GitHub source ${fullName}. Running sync...`);
  const syncResult = await syncEngine.sync(true);
  showSyncOutcome(syncResult, logger, "Initial sync");
}

/**
 * Show a QuickPick of the user's accessible repositories and react to typing.
 *
 * If the user types something that parses as `owner/repo` (or a GitHub URL /
 * SSH ref) and doesn't match any of their listed repos, a synthetic "Use
 * 'owner/repo' as a public repository" item is shown at the top so they can
 * accept it directly. Selecting that item verifies the repo via the GitHub
 * API before returning the canonical `owner/repo`.
 */
function pickGithubRepo(
  repos: RepoInfo[],
  repoService: RepoService,
  logger: Logger
): Promise<string | undefined> {
  return new Promise<string | undefined>((resolve) => {
    const quickPick = vscode.window.createQuickPick<RepoPickItem>();
    quickPick.title = "Add GitHub repository";
    quickPick.placeholder = "Type to filter your repos, or enter any owner/repo (or GitHub URL) to add a public one";
    quickPick.matchOnDescription = true;
    quickPick.matchOnDetail = true;
    quickPick.ignoreFocusOut = true;

    const repoItems: RepoPickItem[] = repos.map((repo) => ({
      label: repo.fullName,
      description: repo.description,
      detail: repo.private ? "Private repository" : "Public repository",
      fullName: repo.fullName
    }));
    quickPick.items = repoItems;

    const knownNames = new Set(repos.map((r) => r.fullName.toLowerCase()));

    const updateItems = (value: string): void => {
      const parsed = parseRepoSpec(value);
      if (!parsed) {
        quickPick.items = repoItems;
        return;
      }
      const candidate = `${parsed.owner}/${parsed.repo}`;
      // Don't duplicate if it's already in the listed repos.
      if (knownNames.has(candidate.toLowerCase())) {
        quickPick.items = repoItems;
        return;
      }
      const synthetic: RepoPickItem = {
        label: `$(globe) Use ${candidate}`,
        description: "Add as a public repository",
        detail: "Verifies the repo exists and is readable, then adds it",
        fullName: candidate,
        isManual: true,
        alwaysShow: true
      };
      quickPick.items = [synthetic, ...repoItems];
    };

    quickPick.onDidChangeValue(updateItems);

    quickPick.onDidAccept(async () => {
      const picked = quickPick.selectedItems[0] ?? quickPick.activeItems[0];
      if (!picked) {
        return;
      }
      if (!picked.isManual) {
        quickPick.hide();
        resolve(picked.fullName);
        return;
      }

      // Verify the typed repo exists before closing the picker.
      quickPick.busy = true;
      quickPick.enabled = false;
      const parsed = parseRepoSpec(picked.fullName);
      if (!parsed) {
        quickPick.busy = false;
        quickPick.enabled = true;
        return;
      }
      try {
        const info = await repoService.getRepoInfo(parsed.owner, parsed.repo);
        if (!info) {
          quickPick.busy = false;
          quickPick.enabled = true;
          vscode.window.showErrorMessage(
            `Could not find ${parsed.owner}/${parsed.repo}, or your GitHub session does not have access to it.`
          );
          return;
        }
        quickPick.hide();
        resolve(info.fullName);
      } catch (error) {
        quickPick.busy = false;
        quickPick.enabled = true;
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to verify ${parsed.owner}/${parsed.repo}`, error);
        vscode.window.showErrorMessage(`Failed to verify repository: ${message}`);
      }
    });

    quickPick.onDidHide(() => {
      quickPick.dispose();
      resolve(undefined);
    });

    quickPick.show();
  });
}

/**
 * Parse `owner/repo`, GitHub URLs, or SSH refs into `{ owner, repo }`. Returns
 * `null` for anything that doesn't look like a valid repo reference.
 */
function parseRepoSpec(raw: string): { owner: string; repo: string } | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  const urlMatch = trimmed.match(/^https?:\/\/github\.com\/([^/\s]+)\/([^/\s?#]+?)(?:\.git)?(?:[/?#].*)?$/i);
  if (urlMatch) {
    return { owner: urlMatch[1], repo: urlMatch[2] };
  }

  const sshMatch = trimmed.match(/^git@github\.com:([^/\s]+)\/([^/\s]+?)(?:\.git)?$/i);
  if (sshMatch) {
    return { owner: sshMatch[1], repo: sshMatch[2] };
  }

  const slashMatch = trimmed.match(/^([^/\s]+)\/([^/\s]+?)(?:\.git)?$/);
  if (slashMatch) {
    return { owner: slashMatch[1], repo: slashMatch[2] };
  }

  return null;
}

async function addRegistrySource(
  configService: ConfigService,
  syncEngine: SyncEngine,
  logger: Logger
): Promise<void> {
  const url = await vscode.window.showInputBox({
    title: "Custom skills registry",
    prompt: "Base URL for the registry (https://...). HTTP is only allowed for localhost.",
    validateInput: (value) => {
      if (!value || !value.trim()) {
        return "Registry URL is required.";
      }
      let parsed: URL;
      try {
        parsed = new URL(value.trim());
      } catch {
        return "Enter a valid URL.";
      }
      const isLocal = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || parsed.hostname === "::1";
      if (parsed.protocol !== "https:" && !(isLocal && parsed.protocol === "http:")) {
        return "Registry URL must use https (http only allowed for localhost).";
      }
      // GitHub web URLs aren't registry endpoints — guide users to the GitHub source type.
      if (/^github\.com$/i.test(parsed.hostname)) {
        return "GitHub URLs are not custom registries. Cancel and choose 'GitHub repository' instead, then enter `owner/repo`.";
      }
      return null;
    },
    ignoreFocusOut: true
  });

  if (!url) {
    return;
  }

  const source: SourceConfig = { type: "custom-registry", value: url.trim() };
  const label = await promptForLabel(source);
  if (label !== undefined && label.length > 0) {
    source.label = label;
  }

  await configService.addSource(source);
  logger.log(`Added registry source ${url.trim()}`);
  vscode.window.showInformationMessage(`Added registry source ${url.trim()}. Running sync...`);
  const syncResult = await syncEngine.sync(true);
  showSyncOutcome(syncResult, logger, "Initial sync");
}

async function promptForLabel(source: SourceConfig): Promise<string | undefined> {
  const suggested = deriveSourceLabel(source);
  const value = await vscode.window.showInputBox({
    title: `Label for ${sourceTypeLabel(source.type)} source`,
    prompt: `Used as the folder under .cursor/rules/<label>/. Press enter to accept the suggestion (${suggested}).`,
    value: suggested,
    ignoreFocusOut: true
  });
  if (value === undefined) {
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed === suggested) {
    return "";
  }
  return trimmed;
}

/**
 * Pick one of the configured sources to remove (or accept an explicit
 * `sourceKey` from the webview "X" button) and clean up its synced files.
 */
export async function removeSourceCommand(
  configService: ConfigService,
  catalogStore: SkillCatalogStore,
  logger: Logger,
  preselectedSourceKey?: string
): Promise<void> {
  const sources = configService.getResolvedSources();
  if (sources.length === 0) {
    vscode.window.showInformationMessage("No skill sources are configured.");
    return;
  }

  let target = preselectedSourceKey
    ? sources.find((s) => s.sourceKey === preselectedSourceKey)
    : undefined;

  if (!target) {
    const picked = await vscode.window.showQuickPick(
      sources.map((source) => ({
        label: source.label,
        description: source.value,
        detail: sourceTypeLabel(source.type),
        sourceKey: source.sourceKey
      })),
      { placeHolder: "Select a skill source to remove" }
    );
    if (!picked) {
      return;
    }
    target = sources.find((s) => s.sourceKey === picked.sourceKey);
  }

  if (!target) {
    return;
  }

  const confirm = await vscode.window.showWarningMessage(
    `Remove source ${target.label}? Synced files in .cursor/rules/${target.label}/ and .cursor/skills/${target.label}/ will be deleted.`,
    { modal: true },
    "Remove"
  );
  if (confirm !== "Remove") {
    return;
  }

  catalogStore.clear(target.sourceKey);
  await configService.removeSource((s) => s.type === target.type && s.value === target.value);

  // Strip opted-in entries owned by this source.
  const remaining = configService.getOptedInSkills().filter((entry) => {
    const idx = entry.indexOf("/");
    if (idx <= 0) {
      return true;
    }
    return entry.slice(0, idx) !== target.label;
  });
  await configService.setOptedInSkills(remaining);

  const [existingFiles, existingPackages] = await Promise.all([
    listExistingSkillFiles(),
    listExistingSkillPackages()
  ]);
  await Promise.all([
    ...existingFiles.filter((e) => e.label === target.label).map((e) => deleteSkillFile(e.label, e.name)),
    ...existingPackages.filter((e) => e.label === target.label).map((e) => deleteSkillPackage(e.label, e.name))
  ]);

  logger.log(`Removed source ${target.label}`);
  vscode.window.showInformationMessage(`Removed source ${target.label}.`);
}

function safeRegisterCommand(
  context: vscode.ExtensionContext,
  command: string,
  callback: (...args: unknown[]) => unknown
): void {
  try {
    const disposable = vscode.commands.registerCommand(command, callback);
    context.subscriptions.push(disposable);
  } catch {
    // Command already registered by a previous (not yet deactivated) instance.
    // The existing registration will continue to work; skip silently.
  }
}

export function registerCommands(
  context: vscode.ExtensionContext,
  authService: AuthService,
  configService: ConfigService,
  repoService: RepoService,
  syncEngine: SyncEngine,
  logger: Logger,
  catalogStore: SkillCatalogStore,
  focusSkillSidebar: () => void
): void {
  safeRegisterCommand(context, "skillSync.manageSkills", () => focusSkillSidebar());
  safeRegisterCommand(context, "skillSync.focusSidebar", () => focusSkillSidebar());
  safeRegisterCommand(context, "skillSync.configureSource", async () => {
    await configureSource(authService, configService, repoService, syncEngine, logger);
  });
  safeRegisterCommand(context, "skillSync.removeSource", async () => {
    await removeSourceCommand(configService, catalogStore, logger);
  });
  safeRegisterCommand(context, "skillSync.syncNow", async () => {
    const syncResult = await syncEngine.sync(true);
    showSyncOutcome(syncResult, logger, "Sync");
  });

  safeRegisterCommand(context, "skillSync.signIn", async () => {
    await signInToGitHub(syncEngine, logger);
  });

  safeRegisterCommand(context, "skillSync.setOpenAiRecommendationKey", async () => {
    const v = await vscode.window.showInputBox({
      title: "OpenAI API key (recommendations)",
      prompt: "Stored securely in Secret Storage — never written to settings.json.",
      password: true,
      ignoreFocusOut: true
    });
    if (v !== undefined && v.trim().length > 0) {
      await context.secrets.store(RECOMMENDATION_SECRET_KEYS.openai, v.trim());
      vscode.window.showInformationMessage("OpenAI key saved for Skill Sync recommendations.");
    }
  });

  safeRegisterCommand(context, "skillSync.setAnthropicRecommendationKey", async () => {
    const v = await vscode.window.showInputBox({
      title: "Anthropic API key (recommendations)",
      prompt: "Stored securely in Secret Storage.",
      password: true,
      ignoreFocusOut: true
    });
    if (v !== undefined && v.trim().length > 0) {
      await context.secrets.store(RECOMMENDATION_SECRET_KEYS.anthropic, v.trim());
      vscode.window.showInformationMessage("Anthropic key saved for Skill Sync recommendations.");
    }
  });

  safeRegisterCommand(context, "skillSync.setCursorSdkRecommendationKey", async () => {
    const v = await vscode.window.showInputBox({
      title: "Cursor API key (recommendations)",
      prompt: "From your Cursor dashboard — used only for ranking in the Recommended tab.",
      password: true,
      ignoreFocusOut: true
    });
    if (v !== undefined && v.trim().length > 0) {
      await context.secrets.store(RECOMMENDATION_SECRET_KEYS.cursorSdk, v.trim());
      vscode.window.showInformationMessage("Cursor API key saved for Skill Sync recommendations.");
    }
  });

  safeRegisterCommand(context, "skillSync.clearRecommendationKeys", async () => {
    await Promise.all([
      context.secrets.delete(RECOMMENDATION_SECRET_KEYS.openai),
      context.secrets.delete(RECOMMENDATION_SECRET_KEYS.anthropic),
      context.secrets.delete(RECOMMENDATION_SECRET_KEYS.cursorSdk)
    ]);
    vscode.window.showInformationMessage("Cleared recommendation API keys.");
  });
}

/**
 * Force a fresh GitHub auth flow and re-run sync.
 *
 * `forceNewSession: true` tells VS Code to re-prompt even if there is already
 * a cached session (which is the case when a token has expired server-side
 * but VS Code still considers it valid). After successful sign-in, we kick
 * off a manual sync so the user gets immediate feedback that the new session
 * works.
 */
async function signInToGitHub(syncEngine: SyncEngine, logger: Logger): Promise<void> {
  try {
    const session = await vscode.authentication.getSession(
      "github",
      ["read:org", "repo"],
      { forceNewSession: true }
    );
    if (!session) {
      vscode.window.showWarningMessage("GitHub sign-in was cancelled.");
      return;
    }
    logger.log(`Signed in to GitHub as ${session.account.label}.`);
    vscode.window.showInformationMessage(
      `Signed in to GitHub as ${session.account.label}. Running sync...`
    );
    const syncResult = await syncEngine.sync(true);
    showSyncOutcome(syncResult, logger, "Sync");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("GitHub sign-in failed", error);
    vscode.window.showErrorMessage(`GitHub sign-in failed: ${message}`);
  }
}

function showSyncOutcome(result: SyncResult, logger: Logger, label: string): void {
  const handleChoice = (choice: string | undefined): void => {
    if (choice === "Sign In") {
      void vscode.commands.executeCommand("skillSync.signIn");
    }
    if (choice === "View Logs") {
      logger.show();
    }
  };

  if (result.status === "success") {
    vscode.window.showInformationMessage(`${label} completed. ${result.message}`);
    return;
  }

  // Auth issues take priority over the partial/failed distinction so the
  // user always gets a Sign In button when one is needed — even when other
  // sources synced successfully and the overall status is "partial".
  if (result.reason === "no_session" || result.reason === "auth_expired") {
    void vscode.window
      .showWarningMessage(
        `${label} requires GitHub sign-in. ${result.message}`,
        "Sign In",
        "View Logs"
      )
      .then(handleChoice);
    return;
  }

  if (result.status === "partial") {
    void vscode.window
      .showWarningMessage(`${label} completed with issues.`, "View Logs")
      .then(handleChoice);
    return;
  }

  void vscode.window
    .showErrorMessage(`${label} failed: ${result.message}`, "View Logs")
    .then(handleChoice);
}
