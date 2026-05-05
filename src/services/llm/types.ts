import type { RecommendationMatchKind } from "../../../webview-ui/types/messages";

export type RecommenderProviderId = "vscode-lm" | "cursor-sdk" | "openai" | "anthropic";

/** Parsed row from model JSON before merging with SkillMeta. */
export interface LlmRawRecommendation {
  name: string;
  score: number;
  reason: string;
  matchKind: RecommendationMatchKind;
}

export interface LlmRankResult {
  recommendations: LlmRawRecommendation[];
}
