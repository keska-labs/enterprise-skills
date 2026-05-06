import { CatalogService } from "./CatalogService";
import { SkillCatalogStore } from "./SkillCatalogStore";
import { SourceProviderRegistry } from "./SourceProviderRegistry";
import { SourceCatalogProvider } from "./SourceCatalogProvider";
import { ServiceError } from "./ServiceError";
import { Logger } from "../utils/logger";

describe("CatalogService", () => {
  const sourceKey = "github:owner/repo";

  function createProvider(overrides?: Partial<SourceCatalogProvider>): SourceCatalogProvider {
    return {
      fetchCatalog: jest.fn().mockResolvedValue({
        skillsRoot: "skills",
        metas: [{ name: "skill-a", path: "skills/skill-a.mdc", shaOrVersion: "abc1234", skillType: "cursor-rule" }]
      }),
      fetchContent: jest.fn().mockResolvedValue({ content: "body", shaOrVersion: "abc1234" }),
      ...overrides
    };
  }

  it("returns cached catalog when complete", async () => {
    const store = {
      load: jest.fn().mockReturnValue({
        skillsRoot: "skills",
        metas: [{ name: "skill-a", path: "skills/skill-a.mdc", shaOrVersion: "abc1234", skillType: "cursor-rule" }]
      }),
      save: jest.fn(),
      merge: jest.fn(),
      clear: jest.fn()
    } as unknown as SkillCatalogStore;
    const registry = { get: jest.fn() } as unknown as SourceProviderRegistry;
    const service = new CatalogService(store, registry);

    const snapshot = await service.getCatalog(sourceKey);
    expect(snapshot.metas).toHaveLength(1);
    expect(registry.get).not.toHaveBeenCalled();
  });

  it("coalesces in-flight fetches for the same source", async () => {
    const store = {
      load: jest.fn().mockReturnValue(undefined),
      save: jest.fn(),
      merge: jest.fn(),
      clear: jest.fn()
    } as unknown as SkillCatalogStore;
    const provider = createProvider();
    const registry = { get: jest.fn().mockReturnValue(provider) } as unknown as SourceProviderRegistry;
    const service = new CatalogService(store, registry);

    await Promise.all([service.getCatalog(sourceKey), service.getCatalog(sourceKey)]);

    expect(registry.get).toHaveBeenCalledTimes(1);
    expect(provider.fetchCatalog).toHaveBeenCalledTimes(1);
    expect(store.save).toHaveBeenCalledTimes(1);
  });

  it("force refreshes even when cache exists", async () => {
    const store = {
      load: jest.fn().mockReturnValue({
        skillsRoot: "skills",
        metas: [{ name: "skill-a", path: "skills/skill-a.mdc", shaOrVersion: "abc1234", skillType: "cursor-rule" }]
      }),
      save: jest.fn(),
      merge: jest.fn(),
      clear: jest.fn()
    } as unknown as SkillCatalogStore;
    const provider = createProvider();
    const registry = { get: jest.fn().mockReturnValue(provider) } as unknown as SourceProviderRegistry;
    const service = new CatalogService(store, registry);

    await service.getCatalog(sourceKey, { forceRefresh: true });
    expect(provider.fetchCatalog).toHaveBeenCalledTimes(1);
    expect(store.save).toHaveBeenCalledTimes(1);
  });

  it("serves stale cached snapshot when provider is rate-limited", async () => {
    const cached = {
      skillsRoot: "skills",
      metas: [{ name: "skill-a", path: "skills/skill-a.mdc", shaOrVersion: "abc1234", skillType: "cursor-rule" as const }]
    };
    const store = {
      load: jest.fn().mockReturnValue(cached),
      save: jest.fn(),
      merge: jest.fn(),
      clear: jest.fn()
    } as unknown as SkillCatalogStore;
    const retryAt = new Date("2030-01-01T00:00:00Z");
    const provider = createProvider({
      fetchCatalog: jest.fn().mockRejectedValue(new ServiceError("rate_limited", "GitHub API rate limit reached.", retryAt))
    });
    const registry = { get: jest.fn().mockReturnValue(provider) } as unknown as SourceProviderRegistry;
    const logger = { warn: jest.fn(), log: jest.fn(), error: jest.fn(), show: jest.fn(), dispose: jest.fn() } as unknown as Logger;
    const service = new CatalogService(store, registry, logger);

    const snapshot = await service.getCatalog(sourceKey, { forceRefresh: true });

    expect(snapshot.metas).toHaveLength(1);
    expect(snapshot.isStale).toBe(true);
    expect(snapshot.staleReason).toBe("rate_limited");
    expect(snapshot.retryAt).toBe(retryAt.toISOString());
    expect(store.save).not.toHaveBeenCalled();
  });

  it("rethrows rate-limit failure when there is no cached snapshot", async () => {
    const store = {
      load: jest.fn().mockReturnValue(undefined),
      save: jest.fn(),
      merge: jest.fn(),
      clear: jest.fn()
    } as unknown as SkillCatalogStore;
    const provider = createProvider({
      fetchCatalog: jest.fn().mockRejectedValue(new ServiceError("rate_limited", "GitHub API rate limit reached."))
    });
    const registry = { get: jest.fn().mockReturnValue(provider) } as unknown as SourceProviderRegistry;
    const service = new CatalogService(store, registry);

    await expect(service.getCatalog(sourceKey, { forceRefresh: true })).rejects.toThrow("GitHub API rate limit reached.");
    expect(store.save).not.toHaveBeenCalled();
  });

  it("does not serve stale cache for non-transient failures (auth)", async () => {
    const cached = {
      skillsRoot: "skills",
      metas: [{ name: "skill-a", path: "skills/skill-a.mdc", shaOrVersion: "abc1234", skillType: "cursor-rule" as const }]
    };
    const store = {
      load: jest.fn().mockReturnValue(cached),
      save: jest.fn(),
      merge: jest.fn(),
      clear: jest.fn()
    } as unknown as SkillCatalogStore;
    const provider = createProvider({
      fetchCatalog: jest.fn().mockRejectedValue(new ServiceError("auth_expired", "GitHub authorization expired."))
    });
    const registry = { get: jest.fn().mockReturnValue(provider) } as unknown as SourceProviderRegistry;
    const service = new CatalogService(store, registry);

    await expect(service.getCatalog(sourceKey, { forceRefresh: true })).rejects.toThrow("GitHub authorization expired.");
    expect(store.save).not.toHaveBeenCalled();
  });

  it("refreshes when cached skill packages are incomplete", async () => {
    const store = {
      load: jest.fn().mockReturnValue({
        skillsRoot: "skills",
        metas: [{ name: "pkg", path: "skills/pkg", shaOrVersion: "old", skillType: "skill" }]
      }),
      save: jest.fn(),
      merge: jest.fn(),
      clear: jest.fn()
    } as unknown as SkillCatalogStore;
    const provider = createProvider({
      fetchCatalog: jest.fn().mockResolvedValue({
        skillsRoot: "skills",
        metas: [
          {
            name: "pkg",
            path: "skills/pkg",
            shaOrVersion: "new",
            skillType: "skill",
            skillFiles: ["skills/pkg/SKILL.md"]
          }
        ]
      })
    });
    const registry = { get: jest.fn().mockReturnValue(provider) } as unknown as SourceProviderRegistry;
    const service = new CatalogService(store, registry);

    const snapshot = await service.getCatalog(sourceKey);
    expect(snapshot.metas[0].shaOrVersion).toBe("new");
    expect(provider.fetchCatalog).toHaveBeenCalledTimes(1);
  });
});
