import type { RecommendationMatchKind } from "../../../webview-ui/types/messages";

export type RecommenderProviderId = "vscode-lm" | "cursor-sdk" | "openai" | "anthropic";

/** Parsed row from model JSON before merging with SkillMeta. */
export interface LlmRawRecommendation {
  name: string;
  score: number;
  reason: string;
  matchKind: RecommendationMatchKind;
  /** When the skill is not in the prefetched catalog — backing GitHub repo to install from. */
  installSource?: { value: string; skillPath?: string };
  /** Must match a configured discovery source key when multiple directories exist (e.g. `official-skills:directory`). */
  discoverySourceKey?: string;
}

export interface LlmRankResult {
  recommendations: LlmRawRecommendation[];
}
