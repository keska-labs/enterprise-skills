import * as vscode from "vscode";
import { migrateOptedInSkillsIfNeeded, OPTED_IN_MIGRATION_FLAG } from "./optedInMigration";
import { ConfigService } from "./ConfigService";
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

function configWith(opted: string[], sources: ResolvedSource[]): {
  service: ConfigService;
  setOptedIn: jest.Mock;
} {
  const setOptedIn = jest.fn().mockResolvedValue(undefined);
  return {
    setOptedIn,
    service: {
      getOptedInSkills: jest.fn().mockReturnValue(opted),
      setOptedInSkills: setOptedIn,
      getResolvedSources: jest.fn().mockReturnValue(sources)
    } as unknown as ConfigService
  };
}

describe("migrateOptedInSkillsIfNeeded", () => {
  it("rewrites bare names into composite keys when there is one source", async () => {
    const sources: ResolvedSource[] = [
      { type: "github-repo", value: "owner/repo", label: "repo", sourceKey: "github:owner/repo" }
    ];
    const memento = createMemento();
    const { service, setOptedIn } = configWith(["alpha", "beta"], sources);
    const ran = await migrateOptedInSkillsIfNeeded(service, memento);
    expect(ran).toBe(true);
    expect(setOptedIn).toHaveBeenCalledWith(["repo/alpha", "repo/beta"]);
    expect(memento.get<boolean>(OPTED_IN_MIGRATION_FLAG)).toBe(true);
  });

  it("is idempotent once the flag is set", async () => {
    const sources: ResolvedSource[] = [
      { type: "github-repo", value: "owner/repo", label: "repo", sourceKey: "github:owner/repo" }
    ];
    const memento = createMemento({ [OPTED_IN_MIGRATION_FLAG]: true });
    const { service, setOptedIn } = configWith(["alpha"], sources);
    const ran = await migrateOptedInSkillsIfNeeded(service, memento);
    expect(ran).toBe(false);
    expect(setOptedIn).not.toHaveBeenCalled();
  });

  it("does not migrate when there are multiple sources", async () => {
    const sources: ResolvedSource[] = [
      { type: "github-repo", value: "owner/a", label: "a", sourceKey: "github:owner/a" },
      { type: "github-repo", value: "owner/b", label: "b", sourceKey: "github:owner/b" }
    ];
    const memento = createMemento();
    const { service, setOptedIn } = configWith(["alpha"], sources);
    const ran = await migrateOptedInSkillsIfNeeded(service, memento);
    expect(ran).toBe(false);
    expect(setOptedIn).not.toHaveBeenCalled();
    expect(memento.get<boolean>(OPTED_IN_MIGRATION_FLAG)).toBeUndefined();
  });

  it("leaves already-composite entries untouched", async () => {
    const sources: ResolvedSource[] = [
      { type: "github-repo", value: "owner/repo", label: "repo", sourceKey: "github:owner/repo" }
    ];
    const memento = createMemento();
    const { service, setOptedIn } = configWith(["repo/alpha"], sources);
    const ran = await migrateOptedInSkillsIfNeeded(service, memento);
    expect(ran).toBe(false);
    expect(setOptedIn).not.toHaveBeenCalled();
    expect(memento.get<boolean>(OPTED_IN_MIGRATION_FLAG)).toBe(true);
  });
});
