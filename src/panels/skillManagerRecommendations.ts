import * as vscode from "vscode";
import { ConfigService } from "../services/ConfigService";
import { SkillCatalogStore } from "../services/SkillCatalogStore";
import { WorkspaceAnalyzer } from "../services/WorkspaceAnalyzer";
import { LlmSkillRecommender } from "../services/LlmSkillRecommender";
import { Recommendation } from "../../webview-ui/types/messages";
import { buildAskAgentPrompt, SKILL_RECOMMENDER_CHAT_PROMPT } from "../utils/chatPrompt";
import { ResolvedSource, SkillMeta } from "../types";

interface MergedCachedCatalog {
  metas: SkillMeta[];
  optedIn: string[];
  sources: ResolvedSource[];
}

function loadCachedMergedCatalog(
  configService: ConfigService,
  catalogStore: SkillCatalogStore
): MergedCachedCatalog {
  const sources = configService.getResolvedSources();
  const metas: SkillMeta[] = [];
  const seen = new Set<string>();
  for (const source of sources) {
    const cached = catalogStore.load(source.sourceKey);
    if (!cached) {
      continue;
    }
    for (const meta of cached.metas) {
      const key = `${source.label}/${meta.name}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      metas.push({ ...meta, source: { type: source.type, value: source.value, label: source.label, sourceKey: source.sourceKey } });
    }
  }
  return { metas, optedIn: configService.getOptedInSkills(), sources };
}

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
  const merged = loadCachedMergedCatalog(configService, catalogStore);
  if (merged.metas.length === 0 || merged.sources.length === 0) {
    return { recommendations: [], catalogReady: false, source: "heuristic" };
  }

  const profile = await workspaceAnalyzer.analyze();
  const token = options?.token ?? new vscode.CancellationTokenSource().token;
  const llm = await llmRecommender.buildRecommendations({
    profile,
    metas: merged.metas,
    optedInSkills: merged.optedIn,
    sources: merged.sources,
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
  const merged = loadCachedMergedCatalog(configService, catalogStore);
  if (merged.metas.length === 0) {
    return SKILL_RECOMMENDER_CHAT_PROMPT;
  }
  const profile = await workspaceAnalyzer.analyze();
  return buildAskAgentPrompt(profile, merged.metas, merged.optedIn);
}
