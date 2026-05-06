import * as vscode from "vscode";
import { AuthService } from "../services/AuthService";
import { ConfigService } from "../services/ConfigService";
import { RepoService } from "../services/RepoService";
import { SyncEngine } from "../services/SyncEngine";
import { SkillCatalogStore } from "../services/SkillCatalogStore";
import { CatalogService } from "../services/CatalogService";
import { MultiSourceCatalogService } from "../services/MultiSourceCatalogService";
import { WorkspaceAnalyzer } from "../services/WorkspaceAnalyzer";
import { Logger } from "../utils/logger";
import { configureSource, removeSourceCommand } from "../commands/registerCommands";
import { SkillInfo, SkillManagerState, WebviewMessage } from "../../webview-ui/types/messages";
import { buildAskAgentPromptFromContext, buildRecommendationsPayload } from "./skillManagerRecommendations";
import { LlmSkillRecommender } from "../services/LlmSkillRecommender";
import { buildSkillManagerState, disconnectSource, fallbackSkillManagerState } from "./skillManagerState";
import { seedChatWithPrompt } from "../utils/chatPrompt";
import {
  handleGithubExpandBrowsePath,
  handleGithubLoadBrowseRoot
} from "./skillManagerBrowse";
import { ServiceError } from "../services/ServiceError";
import { getSkillManagerWebviewHtml } from "../utils/skillManagerWebviewHtml";
import { SkillMeta } from "../types";
import { compositeSkillKey } from "../utils/sources";

export class SkillManagerPanel {
  private static currentPanel: SkillManagerPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;

  public static render(
    extensionUri: vscode.Uri,
    authService: AuthService,
    configService: ConfigService,
    repoService: RepoService,
    syncEngine: SyncEngine,
    logger: Logger,
    catalogStore: SkillCatalogStore,
    catalogService: CatalogService,
    multiSourceService: MultiSourceCatalogService,
    workspaceAnalyzer: WorkspaceAnalyzer,
    llmSkillRecommender: LlmSkillRecommender,
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
      configureSourceFn
    );
  }

  private recommendedTabActive = false;
  private recommendationsCts?: vscode.CancellationTokenSource;

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
    private readonly repoService: RepoService,
    private readonly syncEngine: SyncEngine,
    private readonly logger: Logger,
    private readonly catalogStore: SkillCatalogStore,
    private readonly catalogService: CatalogService,
    private readonly multiSourceService: MultiSourceCatalogService,
    private readonly workspaceAnalyzer: WorkspaceAnalyzer,
    private readonly llmSkillRecommender: LlmSkillRecommender,
    private readonly configureSourceFn: typeof configureSource
  ) {
    this.panel = panel;
    this.extensionUri = extensionUri;

    this.panel.onDidDispose(() => {
      this.recommendationsCts?.cancel();
      this.recommendationsCts?.dispose();
      this.recommendationsCts = undefined;
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
      if (this.recommendedTabActive) {
        void this.sendRecommendations(false);
      }
    });
  }

  private async handleMessage(message: WebviewMessage): Promise<void> {
    switch (message.type) {
      case "ready":
      case "getState":
        await this.postState();
        break;
      case "addSource":
        await this.configureSourceFn(
          this.authService,
          this.configService,
          this.repoService,
          this.syncEngine,
          this.logger
        );
        await this.postState();
        break;
      case "removeSource":
        await removeSourceCommand(this.configService, this.catalogStore, this.logger, message.sourceKey);
        await this.postState();
        break;
      case "disconnectAll":
        await this.disconnectAll();
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
          current.add(message.compositeKey);
        } else {
          current.delete(message.compositeKey);
        }
        await this.configService.setOptedInSkills([...current]);
        const result = await this.syncEngine.syncSingle(message.compositeKey, message.optIn);
        this.panel.webview.postMessage({ type: "syncComplete", payload: result });
        await this.postState();
        break;
      }
      case "loadBrowseRoot": {
        await handleGithubLoadBrowseRoot(
          this.configService,
          this.catalogService,
          this.repoService,
          this.catalogStore,
          message.sourceKey,
          (msg) => this.panel.webview.postMessage(msg)
        );
        await this.postState();
        break;
      }
      case "expandBrowsePath": {
        await handleGithubExpandBrowsePath(
          this.configService,
          this.catalogService,
          this.repoService,
          this.catalogStore,
          message.sourceKey,
          message.path,
          (msg) => this.panel.webview.postMessage(msg)
        );
        await this.postState();
        break;
      }
      case "getCatalog": {
        const sources = this.configService.getResolvedSources();
        const merged = await this.multiSourceService.getMergedCatalog(sources);
        this.panel.webview.postMessage({
          type: "catalogResult",
          skills: merged.metas.map(metaToSkillInfo)
        });
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
      this.panel.webview.postMessage({ type: "recommendationsResult", ...payload });
    } catch (error: unknown) {
      this.logger.error("Recommendations failed", error);
      this.panel.webview.postMessage({
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
          sources: this.configService.getResolvedSources().map((s) => ({
            type: s.type,
            value: s.value,
            label: s.label,
            sourceKey: s.sourceKey
          })),
          isConnected: false,
          connectionHealth,
          syncStatus: "failed",
          lastError: text
        })
      });
    }
  }

  private async disconnectAll(): Promise<void> {
    const sources = this.configService.getResolvedSources();
    for (const source of sources) {
      await disconnectSource(this.configService, this.catalogStore, source.sourceKey);
    }
    if (sources.length > 0) {
      vscode.window.showInformationMessage("All skill sources disconnected.");
    }
  }

  private async buildState(): Promise<SkillManagerState> {
    return buildSkillManagerState({
      configService: this.configService,
      syncEngine: this.syncEngine,
      logger: this.logger,
      catalogStore: this.catalogStore,
      catalogService: this.catalogService,
      multiSourceService: this.multiSourceService
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

function metaToSkillInfo(meta: SkillMeta): SkillInfo {
  const label = meta.source?.label ?? "";
  return {
    compositeKey: compositeSkillKey(label, meta.name),
    name: meta.name,
    description: meta.description ?? "",
    version: meta.version ?? meta.shaOrVersion.slice(0, 7),
    category: meta.category ?? "Uncategorized",
    skillType: meta.skillType,
    fileCount: meta.skillFiles?.length,
    source: meta.source
      ? { label: meta.source.label, type: meta.source.type, sourceKey: meta.source.sourceKey }
      : undefined
  };
}
