import * as vscode from "vscode";
import { LlmRecommendationCache } from "./LlmRecommendationCache";

function createMemento(): vscode.Memento {
  const data: Record<string, unknown> = {};
  return {
    keys: () => Object.keys(data),
    get: <T>(key: string, defaultValue?: T) =>
      data[key] !== undefined ? (data[key] as T) : (defaultValue as T),
    update: jest.fn(async (key: string, value: unknown) => {
      data[key] = value;
    })
  } as vscode.Memento;
}

describe("LlmRecommendationCache", () => {
  it("returns undefined after TTL expiry", () => {
    jest.useFakeTimers();
    const cache = new LlmRecommendationCache(createMemento());
    const now = Date.now();
    jest.setSystemTime(now);
    cache.set(
      "key1",
      {
        recommendations: [],
        source: "heuristic"
      },
      1000
    );
    expect(cache.get("key1")).toBeDefined();
    jest.setSystemTime(now + 2000);
    expect(cache.get("key1")).toBeUndefined();
    jest.useRealTimers();
  });

  it("invalidate removes entry", () => {
    const cache = new LlmRecommendationCache(createMemento());
    cache.set("k", { recommendations: [], source: "heuristic" }, 60_000);
    cache.invalidate("k");
    expect(cache.get("k")).toBeUndefined();
  });
});
