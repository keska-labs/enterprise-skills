import { RecommendationMatchKind } from "../../../webview-ui/types/messages";
import { LlmRankResult, LlmRawRecommendation } from "./types";

const MATCH_KINDS = new Set<RecommendationMatchKind>(["strong", "weak", "general"]);

function stripMarkdownFences(raw: string): string {
  let s = raw.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/im;
  const m = s.match(fence);
  if (m?.[1]) {
    s = m[1].trim();
  }
  const objStart = s.indexOf("{");
  const objEnd = s.lastIndexOf("}");
  if (objStart >= 0 && objEnd > objStart) {
    s = s.slice(objStart, objEnd + 1);
  }
  return s;
}

function isMatchKind(v: unknown): v is RecommendationMatchKind {
  return typeof v === "string" && MATCH_KINDS.has(v as RecommendationMatchKind);
}

/**
 * Parse model output into structured recommendations; drops unknown skill names.
 */
export function parseLlmRankResponse(raw: string, validNames: Set<string>): LlmRankResult | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripMarkdownFences(raw));
  } catch {
    return undefined;
  }

  if (!parsed || typeof parsed !== "object") {
    return undefined;
  }

  const recs = (parsed as { recommendations?: unknown }).recommendations;
  if (!Array.isArray(recs)) {
    return undefined;
  }

  const recommendations: LlmRawRecommendation[] = [];
  for (const item of recs) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const o = item as Record<string, unknown>;
    const name = typeof o.name === "string" ? o.name.trim() : "";
    if (!name || !validNames.has(name)) {
      continue;
    }
    const score = typeof o.score === "number" && Number.isFinite(o.score) ? Math.round(o.score) : 0;
    const clamped = Math.max(0, Math.min(100, score));
    const reason = typeof o.reason === "string" ? o.reason.trim() : "";
    if (!reason) {
      continue;
    }
    if (!isMatchKind(o.matchKind)) {
      continue;
    }
    recommendations.push({
      name,
      score: clamped,
      reason,
      matchKind: o.matchKind
    });
  }

  if (recommendations.length === 0) {
    return undefined;
  }

  return { recommendations };
}
