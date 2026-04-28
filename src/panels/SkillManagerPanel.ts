import * as vscode from "vscode";
import { AuthService } from "../services/AuthService";
import { ConfigService } from "../services/ConfigService";
import { RepoService } from "../services/RepoService";
import { RegistryService } from "../services/RegistryService";
import { SyncEngine } from "../services/SyncEngine";
import { SkillCatalogStore } from "../services/SkillCatalogStore";
import { Logger } from "../utils/logger";
import { configureSource } from "../commands/registerCommands";
import { SkillManagerState, WebviewMessage } from "../../webview-ui/types/messages";
import {
  buildAnalyticsSessionForPlacement,
  buildSkillManagerState,
  disconnectSource,
  fallbackSkillManagerState,
  resolveGa4ForWebview
} from "./skillManagerState";
import {
  handleGithubExpandBrowsePath,
  handleGithubLoadBrowseRoot,
  handleGithubSearchCatalog
} from "./skillManagerBrowse";
import { ServiceError } from "../services/ServiceError";
import { getSkillManagerWebviewHtml } from "../utils/skillManagerWebviewHtml";

export class SkillManagerPanel {
  private static currentPanel: SkillManagerPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;

  public static render(
    extensionUri: vscode.Uri,
    extensionVersion: string,
    authService: AuthService,
    configService: ConfigService,
    repoService: RepoService,
    registryService: RegistryService,
    syncEngine: SyncEngine,
    logger: Logger,
    catalogStore: SkillCatalogStore,
    configureSourceFn: typeof configureSource
  ): void {
    if (SkillManagerPanel.currentPanel) {
      SkillManagerPanel.currentPanel.panel.reveal(vscode.ViewColumn.One);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      "skillSyncManager",
      "Skill Manager",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, "dist")]
      }
    );

    SkillManagerPanel.currentPanel = new SkillManagerPanel(
      panel,
      extensionUri,
      extensionVersion,
      authService,
      configService,
      repoService,
      registryService,
      syncEngine,
      logger,
      catalogStore,
      configureSourceFn
    );
  }

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    private readonly extensionVersion: string,
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
    private readonly repoService: RepoService,
    private readonly registryService: RegistryService,
    private readonly syncEngine: SyncEngine,
    private readonly logger: Logger,
    private readonly catalogStore: SkillCatalogStore,
    private readonly configureSourceFn: typeof configureSource
  ) {
    this.panel = panel;
    this.extensionUri = extensionUri;

    this.panel.onDidDispose(() => {
      SkillManagerPanel.currentPanel = undefined;
    });

    this.panel.webview.onDidReceiveMessage((message: WebviewMessage) => {
      this.handleMessage(message).catch((error: unknown) => {
        const text = error instanceof Error ? error.message : String(error);
        this.logger.error("Webview message handling failed", error);
        this.panel.webview.postMessage({ type: "error", message: text });
      });
    });

    this.panel.webview.html = getSkillManagerWebviewHtml(this.panel.webview, this.extensionUri);
    this.syncEngine.onSyncComplete(() => {
      void this.postState();
    });
  }

  private async handleMessage(message: WebviewMessage): Promise<void> {
    switch (message.type) {
      case "ready":
      case "getState":
        await this.postState();
        break;
      case "connectRepo":
        await this.configureSourceFn(
          this.authService,
          this.configService,
          this.repoService,
          this.syncEngine,
          this.logger
        );
        await this.postState();
        break;
      case "disconnectRepo":
        await this.disconnectCurrentSource();
        await this.postState();
        break;
      case "syncNow": {
        const syncResult = await this.syncEngine.sync(true);
        this.panel.webview.postMessage({ type: "syncComplete", payload: syncResult });
        await this.postState();
        break;
      }
      case "toggleSkill": {
        const current = new Set(this.configService.getOptedInSkills());
        if (message.optIn) {
          current.add(message.skillName);
        } else {
          current.delete(message.skillName);
        }
        await this.configService.setOptedInSkills([...current]);
        const result = await this.syncEngine.syncSingle(message.skillName, message.optIn);
        this.panel.webview.postMessage({ type: "syncComplete", payload: result });
        await this.postState();
        break;
      }
      case "loadBrowseRoot": {
        await handleGithubLoadBrowseRoot(
          this.configService,
          this.repoService,
          this.catalogStore,
          (msg) => this.panel.webview.postMessage(msg)
        );
        await this.postState();
        break;
      }
      case "expandBrowsePath": {
        await handleGithubExpandBrowsePath(
          this.configService,
          this.repoService,
          this.catalogStore,
          message.path,
          (msg) => this.panel.webview.postMessage(msg)
        );
        await this.postState();
        break;
      }
      case "searchCatalog": {
        await handleGithubSearchCatalog(
          this.configService,
          this.repoService,
          this.catalogStore,
          message.query,
          (msg) => this.panel.webview.postMessage(msg)
        );
        await this.postState();
        break;
      }
    }
  }

  private async postState(): Promise<void> {
    try {
      const state = await this.buildState();
      this.panel.webview.postMessage({ type: "setState", payload: state });
    } catch (error: unknown) {
      const text = error instanceof Error ? error.message : String(error);
      this.logger.error("Failed to post skill manager state", error);
      const connectionHealth =
        error instanceof ServiceError
          ? mapServiceReasonToHealth(error.reason)
          : "unknown";
      this.panel.webview.postMessage({
        type: "setState",
        payload: fallbackSkillManagerState({
          analyticsSession: buildAnalyticsSessionForPlacement("panel", this.extensionVersion),
          ga4MeasurementId: resolveGa4ForWebview(this.configService),
          sourceRepository: this.configService.getSourceRepository(),
          sourceMode: this.configService.getSourceMode(),
          isConnected: false,
          connectionHealth,
          syncStatus: "failed",
          lastError: text
        })
      });
    }
  }

  private async disconnectCurrentSource(): Promise<void> {
    const disconnected = await disconnectSource(this.configService, this.catalogStore);
    if (disconnected) {
      vscode.window.showInformationMessage("Skill source disconnected.");
    }
  }

  private async buildState(): Promise<SkillManagerState> {
    return buildSkillManagerState({
      configService: this.configService,
      registryService: this.registryService,
      syncEngine: this.syncEngine,
      logger: this.logger,
      catalogStore: this.catalogStore,
      analyticsPlacement: "panel",
      extensionVersion: this.extensionVersion
    });
  }
}

function mapServiceReasonToHealth(reason: string): SkillManagerState["connectionHealth"] {
  if (reason === "no_session" || reason === "auth_expired") {
    return "auth_required";
  }
  if (reason === "network") {
    return "offline";
  }
  if (reason === "source_invalid") {
    return "invalid_source";
  }
  return "unknown";
}
