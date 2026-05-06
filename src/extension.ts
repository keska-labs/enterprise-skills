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
import { CatalogService } from "./services/CatalogService";
import { MultiSourceCatalogService } from "./services/MultiSourceCatalogService";
import { SourceProviderRegistry } from "./services/SourceProviderRegistry";
import { WorkspaceAnalyzer } from "./services/WorkspaceAnalyzer";
import { LlmRecommendationCache } from "./services/LlmRecommendationCache";
import { LlmSkillRecommender } from "./services/LlmSkillRecommender";
import { maybeShowConfigurePrompt } from "./utils/welcomePrompt";
import { migrateOptedInSkillsIfNeeded } from "./services/optedInMigration";
import { migrateWorkspaceLayoutIfNeeded } from "./utils/workspaceLayoutMigration";

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
  const providerRegistry = new SourceProviderRegistry(repoService, registryService);
  const catalogService = new CatalogService(catalogStore, providerRegistry, logger);
  const multiSourceService = new MultiSourceCatalogService(catalogService, logger);
  const workspaceAnalyzer = new WorkspaceAnalyzer();
  const llmRecommendationCache = new LlmRecommendationCache(context.globalState);
  const llmSkillRecommender = new LlmSkillRecommender(context.secrets, configService, llmRecommendationCache, logger);

  // Best-effort migrations from the single-source era. Safe to run on every
  // activation: each helper guards itself with a flag in global/workspace state.
  try {
    await configService.migrateLegacySourcesIfNeeded(context.globalState);
    await migrateOptedInSkillsIfNeeded(configService, context.workspaceState);
    await migrateWorkspaceLayoutIfNeeded(configService, context.workspaceState, logger);
  } catch (error) {
    logger.error("Multi-source migration failed", error);
  }

  const syncEngine = new SyncEngine(
    authService,
    configService,
    logger,
    catalogService,
    multiSourceService
  );
  const sidebarProvider = new SkillManagerSidebarProvider(
    context.extensionUri,
    authService,
    configService,
    repoService,
    syncEngine,
    logger,
    catalogStore,
    catalogService,
    multiSourceService,
    workspaceAnalyzer,
    llmSkillRecommender
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
    catalogStore,
    () => {
      void sidebarProvider.focus().catch(() => {
        SkillManagerPanel.render(
          context.extensionUri,
          authService,
          configService,
          repoService,
          syncEngine,
          logger,
          catalogStore,
          catalogService,
          multiSourceService,
          workspaceAnalyzer,
          llmSkillRecommender,
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
  if (configService.hasAnyConfiguredSource()) {
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
