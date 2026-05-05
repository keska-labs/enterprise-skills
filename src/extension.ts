import * as vscode from "vscode";
import { AuthService } from "./services/AuthService";
import { ConfigService } from "./services/ConfigService";
import { RepoService } from "./services/RepoService";
import { RegistryService } from "./services/RegistryService";
import { SyncEngine } from "./services/SyncEngine";
import { Logger } from "./utils/logger";
import { configureSource, registerCommands } from "./commands/registerCommands";
import { SkillManagerPanel } from "./panels/SkillManagerPanel";
import { SkillManagerSidebarProvider } from "./panels/SkillManagerSidebarProvider";
import { SkillCatalogStore } from "./services/SkillCatalogStore";
import { maybeShowConfigurePrompt } from "./utils/welcomePrompt";

let syncEngineRef: SyncEngine | undefined;
let loggerRef: Logger | undefined;
let activated = false;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  if (activated) {
    return;
  }
  activated = true;

  const logger = new Logger("Agent Skill Sync");
  const authService = new AuthService();
  const configService = new ConfigService();
  const repoService = new RepoService(authService);
  const registryService = new RegistryService(authService, configService);
  const catalogStore = new SkillCatalogStore(context.globalState);
  const syncEngine = new SyncEngine(
    authService,
    configService,
    repoService,
    registryService,
    logger,
    catalogStore
  );
  const sidebarProvider = new SkillManagerSidebarProvider(
    context.extensionUri,
    authService,
    configService,
    repoService,
    registryService,
    syncEngine,
    logger,
    catalogStore
  );

  syncEngineRef = syncEngine;
  loggerRef = logger;

  registerCommands(
    context,
    authService,
    configService,
    repoService,
    syncEngine,
    logger,
    () => {
      void sidebarProvider.focus().catch(() => {
        SkillManagerPanel.render(
          context.extensionUri,
          authService,
          configService,
          repoService,
          registryService,
          syncEngine,
          logger,
          catalogStore,
          configureSource
        );
      });
    }
  );

  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 120);
  statusBarItem.name = "Skill Sync";
  statusBarItem.text = "$(hubot) Skills";
  statusBarItem.tooltip = "Open Skill Manager";
  statusBarItem.command = "skillSync.manageSkills";
  statusBarItem.show();

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(SkillManagerSidebarProvider.viewType, sidebarProvider)
  );
  context.subscriptions.push(statusBarItem);
  context.subscriptions.push(syncEngine, { dispose: () => logger.dispose() });
  syncEngine.startScheduler();
  if (configService.isSourceConfigured()) {
    void syncEngine.sync(false);
  } else {
    void maybeShowConfigurePrompt(context, configService, syncEngine);
  }
}

export function deactivate(): void {
  activated = false;
  syncEngineRef?.dispose();
  loggerRef?.dispose();
}
