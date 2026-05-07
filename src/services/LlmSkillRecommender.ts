import * as vscode from "vscode";
import * as crypto from "crypto";
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
import type { LlmStreamSink } from "./llm/streamEvents";
import { combinedSourcesKey, compositeSkillKey } from "../utils/sources";
import { DiscoveryPromptSection, resolveDiscoverySourceForRecommendation } from "./discoveryPrompt";

export interface RecommendationsLlmResult {
  recommendations: Recommendation[];
  source: "llm" | "heuristic";
  providerId?: RecommenderProviderId;
  /** Synthetic discovery-only metas keyed by compositeKey — used when enabling from Recommended. */
  discoveryMetasByCompositeKey: Record<string, SkillMeta>;
}

function discoveryContentFingerprint(sections: DiscoveryPromptSection[]): string {
  if (sections.length === 0) {
    return "none";
  }
  const payload = sections
    .map((s) => ({ k: s.source.sourceKey, u: s.repoUrl, h: s.structureHint }))
    .sort((a, b) => a.k.localeCompare(b.k));
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
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
    discoverySections?: DiscoveryPromptSection[];
    forceRefresh: boolean;
    token: vscode.CancellationToken;
    onStreamEvent?: LlmStreamSink;
  }): Promise<RecommendationsLlmResult> {
    const { profile, metas, optedInSkills, forceRefresh, token, onStreamEvent } = params;
    const discoverySections = params.discoverySections ?? [];
    const sourcesKey =
      params.sources && params.sources.length > 0
        ? combinedSourcesKey(params.sources)
        : (params.sourceKey ?? "");

    const emptyDiscovery: Record<string, SkillMeta> = {};

    const heuristicList = recommend(profile, metas, optedInSkills);

    if (!this.configService.getRecommendationsUseLlm()) {
      onStreamEvent?.({
        type: "status",
        providerId: "recommendations",
        message: "LLM disabled in settings — using heuristic ranking."
      });
      return { recommendations: heuristicList, source: "heuristic", discoveryMetasByCompositeKey: emptyDiscovery };
    }

    const workspaceUri = vscode.workspace.workspaceFolders?.[0]?.uri.toString() ?? "";
    const profileFp = workspaceProfileFingerprint(profile);
    const catalogFp = catalogManifestFingerprint(metas);
    const discoveryFp = discoveryContentFingerprint(discoverySections);
    const modelFamily = this.configService.getRecommendationsModelFamily();
    const cursorSdkModel = this.configService.getRecommendationsCursorSdkModel();
    const openAiModel = this.configService.getRecommendationsOpenAiModel();
    const anthropicModel = this.configService.getRecommendationsAnthropicModel();

    const cacheKey = recommendationCacheCompositeKey({
      workspaceUri,
      sourcesKey,
      profileFp,
      catalogFp,
      discoveryFp,
      modelFamily,
      cursorSdkModel,
      openAiModel,
      anthropicModel
    });

    const ttlMs = Math.max(1, this.configService.getRecommendationsCacheTtlMinutes()) * 60 * 1000;

    if (!forceRefresh) {
      const hit = this.cache.get(cacheKey);
      if (hit) {
        onStreamEvent?.({
          type: "status",
          providerId: hit.providerId ?? "cache",
          message: "Served from cache."
        });
        return {
          recommendations: hit.recommendations,
          source: hit.source,
          providerId: hit.providerId,
          discoveryMetasByCompositeKey: hit.discoveryMetasByCompositeKey ?? {}
        };
      }
    } else {
      this.cache.invalidate(cacheKey);
    }

    const prompt = buildRecommendationPrompt(profile, metas, optedInSkills, discoverySections);
    const validNames = new Set(metas.map((m) => m.name));

    onStreamEvent?.({
      type: "status",
      providerId: "recommendations",
      message: "Contacting language model providers…"
    });

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
      this.logger,
      onStreamEvent
    );

    if (chainResult) {
      const parsed = parseLlmRankResponse(chainResult.raw, validNames);
      if (parsed) {
        const metaByName = new Map(metas.map((m) => [m.name, m]));
        const opted = new Set(optedInSkills.map((n) => n.toLowerCase()));
        const recommendations: Recommendation[] = [];
        const discoveryMetasByCompositeKey: Record<string, SkillMeta> = {};
        const resolvedSources = params.sources ?? [];

        for (const r of parsed.recommendations) {
          if (r.installSource) {
            const resolved = resolveDiscoverySourceForRecommendation(resolvedSources, r.discoverySourceKey);
            if (!resolved) {
              this.logger.warn(
                `LLM discovery recommendation "${r.name}" skipped — could not resolve discoverySourceKey "${r.discoverySourceKey ?? ""}"`
              );
              continue;
            }
            const composite = compositeSkillKey(resolved.label, r.name);
            if (opted.has(r.name.toLowerCase()) || opted.has(composite.toLowerCase())) {
              continue;
            }
            const meta: SkillMeta = {
              name: r.name,
              description: r.reason,
              skillType: "skill",
              shaOrVersion: "discovery",
              isDiscoveryOnly: true,
              installSourceRef: {
                type: "github-repo",
                value: r.installSource.value,
                skillPath: r.installSource.skillPath
              },
              source: {
                type: resolved.type,
                value: resolved.value,
                label: resolved.label,
                sourceKey: resolved.sourceKey
              }
            };
            discoveryMetasByCompositeKey[composite] = meta;
            recommendations.push({
              skill: skillMetaToSkillInfo(meta),
              score: r.score,
              reasons: [r.reason],
              matchKind: r.matchKind,
              aiReason: r.reason
            });
            continue;
          }

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
            providerId: chainResult.providerId,
            discoveryMetasByCompositeKey
          };
          this.cache.set(cacheKey, payload, ttlMs);
          return payload;
        }
      }
    }

    const fallback: RecommendationsLlmResult = {
      recommendations: heuristicList,
      source: "heuristic",
      discoveryMetasByCompositeKey: emptyDiscovery
    };
    onStreamEvent?.({
      type: "status",
      providerId: "recommendations",
      message: "No usable LLM output — falling back to heuristic ranking."
    });
    this.cache.set(cacheKey, fallback, ttlMs);
    return fallback;
  }
}
