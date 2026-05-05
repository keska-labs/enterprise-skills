import * as vscode from "vscode";
import { Recommendation } from "../../webview-ui/types/messages";
import { RecommenderProviderId } from "./llm/types";

const CACHE_ROOT_KEY = "agentSkillSync.llmRecommendationEntries.v1";

export interface LlmRecommendationCacheEntry {
  recommendations: Recommendation[];
  source: "llm" | "heuristic";
  providerId?: RecommenderProviderId;
  expiresAt: number;
}

type StoredMap = Record<string, LlmRecommendationCacheEntry>;

export class LlmRecommendationCache {
  public constructor(private readonly globalState: vscode.Memento) {}

  public get(hash: string): Omit<LlmRecommendationCacheEntry, "expiresAt"> | undefined {
    const map = this.readMap();
    const e = map[hash];
    if (!e || Date.now() > e.expiresAt) {
      return undefined;
    }
    return {
      recommendations: e.recommendations,
      source: e.source,
      providerId: e.providerId
    };
  }

  public set(
    hash: string,
    payload: { recommendations: Recommendation[]; source: "llm" | "heuristic"; providerId?: RecommenderProviderId },
    ttlMs: number
  ): void {
    const map = this.readMap();
    map[hash] = {
      ...payload,
      expiresAt: Date.now() + ttlMs
    };
    void this.globalState.update(CACHE_ROOT_KEY, map);
  }

  public invalidate(hash: string): void {
    const map = this.readMap();
    delete map[hash];
    void this.globalState.update(CACHE_ROOT_KEY, map);
  }

  private readMap(): StoredMap {
    return this.globalState.get<StoredMap>(CACHE_ROOT_KEY, {});
  }
}
