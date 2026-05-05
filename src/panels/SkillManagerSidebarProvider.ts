import * as vscode from "vscode";
import { AuthService } from "../services/AuthService";
import { ConfigService } from "../services/ConfigService";
import { RepoService } from "../services/RepoService";
import { RegistryService } from "../services/RegistryService";
import { SyncEngine } from "../services/SyncEngine";
import { SkillCatalogStore } from "../services/SkillCatalogStore";
import { WorkspaceAnalyzer } from "../services/WorkspaceAnalyzer";
import { Logger } from "../utils/logger";
import { configureSource } from "../commands/registerCommands";
import { SkillManagerState, WebviewMessage } from "../../webview-ui/types/messages";
import { buildAskAgentPromptFromContext, buildRecommendationsPayload } from "./skillManagerRecommendations";
import { LlmSkillRecommender } from "../services/LlmSkillRecommender";
import { buildSkillManagerState, disconnectSource, fallbackSkillManagerState } from "./skillManagerState";
import { seedChatWithPrompt } from "../utils/chatPrompt";
import {
  handleGithubExpandBrowsePath,
  handleGithubLoadBrowseRoot,
  handleGithubSearchCatalog
} from "./skillManagerBrowse";
import { ServiceError } from "../services/ServiceError";
import { getSkillManagerWebviewHtml } from "../utils/skillManagerWebviewHtml";

export class SkillManagerSidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "skillSync.sidebarManager";
  private view?: vscode.WebviewView;
  private recommendedTabActive = false;
  private recommendationsCts?: vscode.CancellationTokenSource;

  public constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
    private readonly repoService: RepoService,
    private readonly registryService: RegistryService,
    private readonly syncEngine: SyncEngine,
    private readonly logger: Logger,
    private readonly catalogStore: SkillCatalogStore,
    private readonly workspaceAnalyzer: WorkspaceAnalyzer,
    private readonly llmSkillRecommender: LlmSkillRecommender
  ) {
    this.syncEngine.onSyncComplete(() => {
      void this.postState();
      if (this.recommendedTabActive) {
        void this.sendRecommendations(false);
      }
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
    webviewView.webview.html = getSkillManagerWebviewHtml(webviewView.webview, this.extensionUri);

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

    webviewView.onDidDispose(() => {
      this.recommendationsCts?.cancel();
      this.recommendationsCts?.dispose();
      this.recommendationsCts = undefined;
    });
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
      case "tabChanged": {
        this.recommendedTabActive = message.tab === "recommended";
        break;
      }
      case "requestRecommendations": {
        await this.sendRecommendations(false);
        break;
      }
      case "refreshRecommendations": {
        await this.sendRecommendations(true);
        break;
      }
      case "askAgentToRecommend": {
        const prompt = await buildAskAgentPromptFromContext(
          this.workspaceAnalyzer,
          this.configService,
          this.catalogStore
        );
        const result = await seedChatWithPrompt(prompt);
        const message = result.viaDeeplink
          ? "Cursor chat opened with the recommendation prompt pre-filled — press enter to send or tweak it first."
          : result.opened
            ? "Opened chat — paste from clipboard (⌘V) if the prompt wasn't pre-filled."
            : "Prompt copied to clipboard — paste it into chat (⌘V) and press enter.";
        await vscode.window.showInformationMessage(message);
        break;
      }
    }
  }

  private async sendRecommendations(forceRefresh: boolean): Promise<void> {
    this.recommendationsCts?.cancel();
    this.recommendationsCts?.dispose();
    this.recommendationsCts = new vscode.CancellationTokenSource();

    try {
      const payload = await buildRecommendationsPayload(
        this.workspaceAnalyzer,
        this.configService,
        this.catalogStore,
        this.llmSkillRecommender,
        { forceRefresh, token: this.recommendationsCts.token }
      );
      this.view?.webview.postMessage({ type: "recommendationsResult", ...payload });
    } catch (error: unknown) {
      this.logger.error("Recommendations failed", error);
      this.view?.webview.postMessage({
        type: "recommendationsResult",
        recommendations: [],
        catalogReady: false,
        source: "heuristic"
      });
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
