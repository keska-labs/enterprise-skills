import { ConfigService, LEGACY_MIGRATION_FLAG } from "../services/ConfigService";
import * as vscode from "vscode";
import { SourceConfig } from "../types";

const getConfiguration = vscode.workspace.getConfiguration as jest.Mock;
const mockUpdate = jest.fn();
const mockGet = jest.fn();

function createMemento(initial: Record<string, unknown> = {}): vscode.Memento {
  const data = { ...initial };
  return {
    keys: () => Object.keys(data),
    get: <T>(key: string, defaultValue?: T) =>
      data[key] !== undefined ? (data[key] as T) : (defaultValue as T),
    update: jest.fn(async (key: string, value: unknown) => {
      data[key] = value;
    })
  } as vscode.Memento;
}

describe("ConfigService", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockUpdate.mockReset();
    getConfiguration.mockReturnValue({
      get: mockGet,
      update: mockUpdate
    });
  });

  it("reads source mode default", () => {
    mockGet.mockReturnValue("github-repo");
    const service = new ConfigService();
    expect(service.getSourceMode()).toBe("github-repo");
  });

  it("writes source repository", async () => {
    const service = new ConfigService();
    await service.setSourceRepository("foo/bar");
    expect(mockUpdate).toHaveBeenCalled();
  });

  it("returns the configured `skillSync.sources` array directly when set", () => {
    const sources: SourceConfig[] = [{ type: "github-repo", value: "owner/repo" }];
    mockGet.mockImplementation((key: string, fallback: unknown) =>
      key === "sources" ? sources : fallback
    );
    const service = new ConfigService();
    expect(service.getSources()).toEqual(sources);
  });

  it("falls back to legacy keys when `sources` is empty", () => {
    mockGet.mockImplementation((key: string, fallback: unknown) => {
      if (key === "sources") {
        return [];
      }
      if (key === "sourceMode") {
        return "github-repo";
      }
      if (key === "sourceRepository") {
        return "owner/repo";
      }
      return fallback;
    });
    const service = new ConfigService();
    const sources = service.getSources();
    expect(sources).toEqual([{ type: "github-repo", value: "owner/repo" }]);
  });

  it("hasAnyConfiguredSource considers migrated array and legacy keys", () => {
    mockGet.mockImplementation((key: string, fallback: unknown) => {
      if (key === "sources") {
        return [{ type: "github-repo", value: "owner/repo" }];
      }
      return fallback;
    });
    const service = new ConfigService();
    expect(service.hasAnyConfiguredSource()).toBe(true);
    expect(service.isSourceConfigured()).toBe(true);
  });

  it("returns false from hasAnyConfiguredSource when nothing is configured", () => {
    mockGet.mockImplementation((key: string, fallback: unknown) => {
      if (key === "sources") {
        return [];
      }
      return fallback ?? "";
    });
    const service = new ConfigService();
    expect(service.hasAnyConfiguredSource()).toBe(false);
  });

  it("migrateLegacySourcesIfNeeded promotes legacy github keys into the new array", async () => {
    mockGet.mockImplementation((key: string, fallback: unknown) => {
      if (key === "sources") {
        return [];
      }
      if (key === "sourceMode") {
        return "github-repo";
      }
      if (key === "sourceRepository") {
        return "owner/repo";
      }
      return fallback ?? "";
    });
    const memento = createMemento();
    const service = new ConfigService();
    const ran = await service.migrateLegacySourcesIfNeeded(memento);
    expect(ran).toBe(true);
    expect(mockUpdate).toHaveBeenCalledWith(
      "sources",
      [{ type: "github-repo", value: "owner/repo" }],
      expect.anything()
    );
    expect(memento.get<boolean>(LEGACY_MIGRATION_FLAG)).toBe(true);
  });

  it("migrateLegacySourcesIfNeeded is idempotent", async () => {
    mockGet.mockImplementation((key: string, fallback: unknown) =>
      key === "sources" ? [{ type: "github-repo", value: "owner/repo" }] : fallback
    );
    const memento = createMemento({ [LEGACY_MIGRATION_FLAG]: true });
    const service = new ConfigService();
    const ran = await service.migrateLegacySourcesIfNeeded(memento);
    expect(ran).toBe(false);
  });

  it("addSource skips duplicate entries", async () => {
    const stored: SourceConfig[] = [{ type: "github-repo", value: "owner/repo" }];
    mockGet.mockImplementation((key: string, fallback: unknown) =>
      key === "sources" ? stored : fallback
    );
    const service = new ConfigService();
    await service.addSource({ type: "github-repo", value: "owner/repo" });
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
