import * as vscode from "vscode";
import { ConfigService } from "../services/ConfigService";
import { SkillCatalogStore, currentSourceKey } from "../services/SkillCatalogStore";
import { WorkspaceAnalyzer } from "../services/WorkspaceAnalyzer";
import { LlmSkillRecommender } from "../services/LlmSkillRecommender";
import { Recommendation } from "../../webview-ui/types/messages";
import { buildAskAgentPrompt, SKILL_RECOMMENDER_CHAT_PROMPT } from "../utils/chatPrompt";

export async function buildRecommendationsPayload(
  workspaceAnalyzer: WorkspaceAnalyzer,
  configService: ConfigService,
  catalogStore: SkillCatalogStore,
  llmRecommender: LlmSkillRecommender,
  options?: { forceRefresh?: boolean; token?: vscode.CancellationToken }
): Promise<{
  recommendations: Recommendation[];
  catalogReady: boolean;
  source: "llm" | "heuristic";
  providerId?: string;
}> {
  const sourceKey = currentSourceKey(configService);
  const cached = catalogStore.load(sourceKey);
  if (!cached || cached.metas.length === 0) {
    return { recommendations: [], catalogReady: false, source: "heuristic" };
  }

  const profile = await workspaceAnalyzer.analyze();
  const optedInSkills = configService.getOptedInSkills();
  const token = options?.token ?? new vscode.CancellationTokenSource().token;
  const llm = await llmRecommender.buildRecommendations({
    profile,
    metas: cached.metas,
    optedInSkills,
    sourceKey,
    forceRefresh: options?.forceRefresh ?? false,
    token
  });

  return {
    recommendations: llm.recommendations,
    catalogReady: true,
    source: llm.source,
    providerId: llm.providerId
  };
}

/**
 * Build the chat prompt the "Ask the Agent" button seeds. Falls back to the
 * lightweight constant when no catalog has been synced yet.
 */
export async function buildAskAgentPromptFromContext(
  workspaceAnalyzer: WorkspaceAnalyzer,
  configService: ConfigService,
  catalogStore: SkillCatalogStore
): Promise<string> {
  const sourceKey = currentSourceKey(configService);
  const cached = catalogStore.load(sourceKey);
  if (!cached || cached.metas.length === 0) {
    return SKILL_RECOMMENDER_CHAT_PROMPT;
  }
  const profile = await workspaceAnalyzer.analyze();
  return buildAskAgentPrompt(profile, cached.metas, configService.getOptedInSkills());
}
