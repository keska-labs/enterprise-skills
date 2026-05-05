import * as vscode from "vscode";
import { LlmSkillRecommender } from "./LlmSkillRecommender";
import { LlmRecommendationCache } from "./LlmRecommendationCache";
import { ConfigService } from "./ConfigService";
import { Logger } from "../utils/logger";
import { WorkspaceProfile } from "./WorkspaceAnalyzer";
import { SkillMeta } from "../types";
import { runLlmProviderChain } from "./llm/LlmProviderChain";

jest.mock("./llm/LlmProviderChain");

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

function mockLogger(): Logger {
  return {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    show: jest.fn(),
    dispose: jest.fn()
  } as unknown as Logger;
}

function baseConfig(over: Partial<Record<string, unknown>> = {}): ConfigService {
  return {
    getRecommendationsUseLlm: () => (over.useLlm as boolean) ?? true,
    getRecommendationsModelFamily: () => "gpt-4o",
    getRecommendationsCacheTtlMinutes: () => 60,
    getRecommendationsCursorSdkModel: () => "composer-2",
    getRecommendationsOpenAiModel: () => "gpt-4o-mini",
    getRecommendationsAnthropicModel: () => "claude-3-5-haiku-20241022"
  } as unknown as ConfigService;
}

describe("LlmSkillRecommender", () => {
  const profile: WorkspaceProfile = {
    languages: new Set(["typescript"]),
    dependencies: new Set(["react"]),
    relativePaths: new Set(["package.json"]),
    installedExtensions: new Set(),
    agentsMdText: null,
    isMonorepo: false
  };

  const metas: SkillMeta[] = [
    {
      name: "react-patterns",
      shaOrVersion: "abc",
      skillType: "skill",
      description: "React help",
      triggers: { dependencies: ["react"] }
    }
  ];

  const secrets = {
    get: jest.fn().mockResolvedValue(undefined),
    store: jest.fn(),
    delete: jest.fn(),
    onDidChange: jest.fn()
  } as unknown as vscode.SecretStorage;

  beforeEach(() => {
    jest.mocked(runLlmProviderChain).mockReset();
  });

  it("skips LLM when disabled in settings", async () => {
    const rec = new LlmSkillRecommender(
      secrets,
      baseConfig({ useLlm: false }),
      new LlmRecommendationCache(createMemento()),
      mockLogger()
    );
    const out = await rec.buildRecommendations({
      profile,
      metas,
      optedInSkills: [],
      sourceKey: "github:a/b",
      forceRefresh: false,
      token: new vscode.CancellationTokenSource().token
    });
    expect(out.source).toBe("heuristic");
    expect(runLlmProviderChain).not.toHaveBeenCalled();
  });

  it("falls back to heuristic when provider chain yields nothing", async () => {
    jest.mocked(runLlmProviderChain).mockResolvedValue(undefined);
    const rec = new LlmSkillRecommender(
      secrets,
      baseConfig(),
      new LlmRecommendationCache(createMemento()),
      mockLogger()
    );
    const out = await rec.buildRecommendations({
      profile,
      metas,
      optedInSkills: [],
      sourceKey: "github:a/b",
      forceRefresh: false,
      token: new vscode.CancellationTokenSource().token
    });
    expect(out.source).toBe("heuristic");
    expect(out.recommendations.length).toBeGreaterThanOrEqual(0);
    expect(runLlmProviderChain).toHaveBeenCalledTimes(1);
  });

  it("parses LLM JSON into ranked recommendations", async () => {
    jest.mocked(runLlmProviderChain).mockResolvedValue({
      providerId: "openai",
      raw: JSON.stringify({
        recommendations: [
          { name: "react-patterns", score: 92, reason: "Workspace uses React", matchKind: "strong" }
        ]
      })
    });
    const rec = new LlmSkillRecommender(
      secrets,
      baseConfig(),
      new LlmRecommendationCache(createMemento()),
      mockLogger()
    );
    const out = await rec.buildRecommendations({
      profile,
      metas,
      optedInSkills: [],
      sourceKey: "github:a/b",
      forceRefresh: false,
      token: new vscode.CancellationTokenSource().token
    });
    expect(out.source).toBe("llm");
    expect(out.providerId).toBe("openai");
    expect(out.recommendations[0].skill.name).toBe("react-patterns");
    expect(out.recommendations[0].aiReason).toBe("Workspace uses React");
  });

  it("caches LLM results per composite key", async () => {
    jest.mocked(runLlmProviderChain).mockResolvedValue({
      providerId: "openai",
      raw: JSON.stringify({
        recommendations: [
          { name: "react-patterns", score: 50, reason: "React", matchKind: "weak" }
        ]
      })
    });
    const memento = createMemento();
    const cache = new LlmRecommendationCache(memento);
    const rec = new LlmSkillRecommender(secrets, baseConfig(), cache, mockLogger());
    const token = new vscode.CancellationTokenSource().token;
    await rec.buildRecommendations({
      profile,
      metas,
      optedInSkills: [],
      sourceKey: "github:a/b",
      forceRefresh: false,
      token
    });
    await rec.buildRecommendations({
      profile,
      metas,
      optedInSkills: [],
      sourceKey: "github:a/b",
      forceRefresh: false,
      token
    });
    expect(runLlmProviderChain).toHaveBeenCalledTimes(1);
  });
});
