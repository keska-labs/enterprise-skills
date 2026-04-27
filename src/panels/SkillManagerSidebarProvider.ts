import * as vscode from "vscode";
import * as crypto from "crypto";
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
  buildSkillManagerState,
  disconnectSource,
  fallbackSkillManagerState
} from "./skillManagerState";
import {
  handleGithubExpandBrowsePath,
  handleGithubLoadBrowseRoot,
  handleGithubSearchCatalog
} from "./skillManagerBrowse";
import { ServiceError } from "../services/ServiceError";

export class SkillManagerSidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "skillSync.sidebarManager";
  private view?: vscode.WebviewView;

  public constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
    private readonly repoService: RepoService,
    private readonly registryService: RegistryService,
    private readonly syncEngine: SyncEngine,
    private readonly logger: Logger,
    private readonly catalogStore: SkillCatalogStore
  ) {
    this.syncEngine.onSyncComplete(() => {
      void this.postState();
    });
  }

  public async focus(): Promise<void> {
    await vscode.commands.executeCommand("workbench.view.extension.skillSync");
    await vscode.commands.executeCommand(`${SkillManagerSidebarProvider.viewType}.focus`);
  }

  public resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, "dist")]
    };
    webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage((message: WebviewMessage) => {
      this.handleMessage(message).catch((error: unknown) => {
        const text = error instanceof Error ? error.message : String(error);
        this.logger.error("Sidebar message handling failed", error);
        webviewView.webview.postMessage({ type: "error", message: text });
      });
    });

    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        void this.postState();
      }
    });
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "dist", "webview.js"));
    const scriptUrl = `${scriptUri.toString()}?v=${Date.now()}`;
    const nonce = crypto.randomBytes(16).toString("hex");
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Skill Manager</title>
      </head>
      <body>
        <div id="root"></div>
        <script nonce="${nonce}" src="${scriptUrl}"></script>
      </body>
      </html>
    `;
  }

  private async handleMessage(message: WebviewMessage): Promise<void> {
    switch (message.type) {
      case "ready":
      case "getState":
        await this.postState();
        break;
      case "connectRepo":
        await configureSource(this.authService, this.configService, this.repoService, this.syncEngine, this.logger);
        await this.postState();
        break;
      case "disconnectRepo":
        await this.disconnectCurrentSource();
        await this.postState();
        break;
      case "syncNow": {
        const syncResult = await this.syncEngine.sync(true);
        this.view?.webview.postMessage({ type: "syncComplete", payload: syncResult });
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
        this.view?.webview.postMessage({ type: "syncComplete", payload: result });
        await this.postState();
        break;
      }
      case "loadBrowseRoot": {
        await handleGithubLoadBrowseRoot(
          this.configService,
          this.repoService,
          this.catalogStore,
          (msg) => this.view?.webview.postMessage(msg)
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
          (msg) => this.view?.webview.postMessage(msg)
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
          (msg) => this.view?.webview.postMessage(msg)
        );
        await this.postState();
        break;
      }
    }
  }

  private async postState(): Promise<void> {
    try {
      const state = await this.buildState();
      this.view?.webview.postMessage({ type: "setState", payload: state });
    } catch (error: unknown) {
      const text = error instanceof Error ? error.message : String(error);
      this.logger.error("Failed to post skill manager state", error);
      const connectionHealth =
        error instanceof ServiceError
          ? mapServiceReasonToHealth(error.reason)
          : "unknown";
      this.view?.webview.postMessage({
        type: "setState",
        payload: fallbackSkillManagerState({
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
      catalogStore: this.catalogStore
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
