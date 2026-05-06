import * as vscode from "vscode";
import { migrateWorkspaceLayoutIfNeeded, WORKSPACE_LAYOUT_MIGRATION_FLAG } from "./workspaceLayoutMigration";
import * as fileUtils from "./fileUtils";
import { ConfigService } from "../services/ConfigService";
import { Logger } from "./logger";
import { ResolvedSource } from "../types";

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

function configWith(sources: ResolvedSource[]): ConfigService {
  return { getResolvedSources: jest.fn().mockReturnValue(sources) } as unknown as ConfigService;
}

function noopLogger(): Logger {
  return {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    show: jest.fn(),
    dispose: jest.fn()
  } as unknown as Logger;
}

describe("migrateWorkspaceLayoutIfNeeded", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("delegates to fileUtils when exactly one source is configured", async () => {
    const moveSpy = jest
      .spyOn(fileUtils, "migrateLegacyWorkspaceLayout")
      .mockResolvedValue({ movedFiles: 2, movedPackages: 1 });
    const memento = createMemento();
    const config = configWith([
      { type: "github-repo", value: "owner/repo", label: "repo", sourceKey: "github:owner/repo" }
    ]);
    const result = await migrateWorkspaceLayoutIfNeeded(config, memento, noopLogger());
    expect(result).toBe(true);
    expect(moveSpy).toHaveBeenCalledWith("repo");
    expect(memento.get<boolean>(WORKSPACE_LAYOUT_MIGRATION_FLAG)).toBe(true);
  });

  it("is a no-op for multi-source workspaces", async () => {
    const moveSpy = jest.spyOn(fileUtils, "migrateLegacyWorkspaceLayout").mockResolvedValue({ movedFiles: 0, movedPackages: 0 });
    const memento = createMemento();
    const config = configWith([
      { type: "github-repo", value: "owner/a", label: "a", sourceKey: "github:owner/a" },
      { type: "github-repo", value: "owner/b", label: "b", sourceKey: "github:owner/b" }
    ]);
    const result = await migrateWorkspaceLayoutIfNeeded(config, memento, noopLogger());
    expect(result).toBe(false);
    expect(moveSpy).not.toHaveBeenCalled();
    expect(memento.get<boolean>(WORKSPACE_LAYOUT_MIGRATION_FLAG)).toBeUndefined();
  });

  it("respects the idempotency flag", async () => {
    const moveSpy = jest.spyOn(fileUtils, "migrateLegacyWorkspaceLayout").mockResolvedValue({ movedFiles: 0, movedPackages: 0 });
    const memento = createMemento({ [WORKSPACE_LAYOUT_MIGRATION_FLAG]: true });
    const config = configWith([
      { type: "github-repo", value: "owner/repo", label: "repo", sourceKey: "github:owner/repo" }
    ]);
    const result = await migrateWorkspaceLayoutIfNeeded(config, memento, noopLogger());
    expect(result).toBe(false);
    expect(moveSpy).not.toHaveBeenCalled();
  });
});
