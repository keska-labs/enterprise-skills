import * as vscode from "vscode";
import { ResolvedSource, SkillMeta } from "../types";
import { Recommendation } from "../../webview-ui/types/messages";
import { WorkspaceProfile } from "./WorkspaceAnalyzer";
import { ConfigService } from "./ConfigService";
import { Logger } from "../utils/logger";
import { recommend, skillMetaToSkillInfo } from "./SkillRecommender";
import { catalogManifestFingerprint } from "../utils/catalogManifest";
import { buildRecommendationPrompt } from "./llm/promptBuilder";
import { parseLlmRankResponse } from "./llm/responseParser";
import { runLlmProviderChain } from "./llm/LlmProviderChain";
import { VscodeLmProvider } from "./llm/VscodeLmProvider";
import { CursorSdkProvider } from "./llm/CursorSdkProvider";
import { OpenAiProvider } from "./llm/OpenAiProvider";
import { AnthropicProvider } from "./llm/AnthropicProvider";
import { recommendationCacheCompositeKey, workspaceProfileFingerprint } from "./llm/fingerprints";
import { LlmRecommendationCache } from "./LlmRecommendationCache";
import { RECOMMENDATION_SECRET_KEYS } from "../constants/recommendationSecrets";
import { RecommenderProviderId } from "./llm/types";
import { combinedSourcesKey, compositeSkillKey } from "../utils/sources";

export interface RecommendationsLlmResult {
  recommendations: Recommendation[];
  source: "llm" | "heuristic";
  providerId?: RecommenderProviderId;
}

export class LlmSkillRecommender {
  public constructor(
    private readonly secrets: vscode.SecretStorage,
    private readonly configService: ConfigService,
    private readonly cache: LlmRecommendationCache,
    private readonly logger: Logger
  ) {}

  public async buildRecommendations(params: {
    profile: WorkspaceProfile;
    metas: SkillMeta[];
    optedInSkills: string[];
    /** Either a single legacy source key (back-compat) or the resolved sources array. */
    sources?: ResolvedSource[];
    sourceKey?: string;
    forceRefresh: boolean;
    token: vscode.CancellationToken;
  }): Promise<RecommendationsLlmResult> {
    const { profile, metas, optedInSkills, forceRefresh, token } = params;
    const sourcesKey = params.sources && params.sources.length > 0
      ? combinedSourcesKey(params.sources)
      : (params.sourceKey ?? "");

    const heuristicList = recommend(profile, metas, optedInSkills);

    if (!this.configService.getRecommendationsUseLlm()) {
      return { recommendations: heuristicList, source: "heuristic" };
    }

    const workspaceUri = vscode.workspace.workspaceFolders?.[0]?.uri.toString() ?? "";
    const profileFp = workspaceProfileFingerprint(profile);
    const catalogFp = catalogManifestFingerprint(metas);
    const modelFamily = this.configService.getRecommendationsModelFamily();
    const cursorSdkModel = this.configService.getRecommendationsCursorSdkModel();
    const openAiModel = this.configService.getRecommendationsOpenAiModel();
    const anthropicModel = this.configService.getRecommendationsAnthropicModel();

    const cacheKey = recommendationCacheCompositeKey({
      workspaceUri,
      sourcesKey,
      profileFp,
      catalogFp,
      modelFamily,
      cursorSdkModel,
      openAiModel,
      anthropicModel
    });

    const ttlMs = Math.max(1, this.configService.getRecommendationsCacheTtlMinutes()) * 60 * 1000;

    if (!forceRefresh) {
      const hit = this.cache.get(cacheKey);
      if (hit) {
        return {
          recommendations: hit.recommendations,
          source: hit.source,
          providerId: hit.providerId
        };
      }
    } else {
      this.cache.invalidate(cacheKey);
    }

    const prompt = buildRecommendationPrompt(profile, metas, optedInSkills);
    const validNames = new Set(metas.map((m) => m.name));

    const [openAiKey, anthropicKey, cursorKey] = await Promise.all([
      this.secrets.get(RECOMMENDATION_SECRET_KEYS.openai),
      this.secrets.get(RECOMMENDATION_SECRET_KEYS.anthropic),
      this.secrets.get(RECOMMENDATION_SECRET_KEYS.cursorSdk)
    ]);

    const vscodeLm = new VscodeLmProvider(modelFamily);
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    const chainResult = await runLlmProviderChain(
      {
        vscodeLm,
        cursorSdk: cursorKey?.trim()
          ? new CursorSdkProvider(cursorKey, cursorSdkModel, workspaceRoot)
          : undefined,
        openAi: openAiKey?.trim() ? new OpenAiProvider(openAiKey, openAiModel) : undefined,
        anthropic: anthropicKey?.trim() ? new AnthropicProvider(anthropicKey, anthropicModel) : undefined
      },
      prompt,
      token,
      this.logger
    );

    if (chainResult) {
      const parsed = parseLlmRankResponse(chainResult.raw, validNames);
      if (parsed) {
        const metaByName = new Map(metas.map((m) => [m.name, m]));
        const opted = new Set(optedInSkills.map((n) => n.toLowerCase()));
        const recommendations: Recommendation[] = [];
        for (const r of parsed.recommendations) {
          const meta = metaByName.get(r.name);
          if (!meta) {
            continue;
          }
          const composite = meta.source ? compositeSkillKey(meta.source.label, meta.name) : meta.name;
          if (opted.has(r.name.toLowerCase()) || opted.has(composite.toLowerCase())) {
            continue;
          }
          recommendations.push({
            skill: skillMetaToSkillInfo(meta),
            score: r.score,
            reasons: [r.reason],
            matchKind: r.matchKind,
            aiReason: r.reason
          });
        }

        if (recommendations.length > 0) {
          recommendations.sort((a, b) => b.score - a.score || a.skill.name.localeCompare(b.skill.name));
          const sliced = recommendations.slice(0, 20);
          const payload: RecommendationsLlmResult = {
            recommendations: sliced,
            source: "llm",
            providerId: chainResult.providerId
          };
          this.cache.set(cacheKey, payload, ttlMs);
          return payload;
        }
      }
    }

    const fallback: RecommendationsLlmResult = { recommendations: heuristicList, source: "heuristic" };
    this.cache.set(cacheKey, fallback, ttlMs);
    return fallback;
  }
}
