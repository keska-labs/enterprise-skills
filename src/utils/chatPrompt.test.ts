import * as vscode from "vscode";
import { buildAskAgentPrompt, seedChatWithPrompt } from "./chatPrompt";
import { WorkspaceProfile } from "../services/WorkspaceAnalyzer";
import { SkillMeta } from "../types";

type MockEnv = {
  clipboard: { writeText: jest.Mock };
  openExternal: jest.Mock;
  appName: string;
  uriScheme: string;
};
const mockEnv = (vscode as unknown as { env: MockEnv }).env;
const mockCommands = (vscode as unknown as {
  commands: { executeCommand: jest.Mock; getCommands: jest.Mock };
}).commands;

function makeProfile(overrides: Partial<WorkspaceProfile> = {}): WorkspaceProfile {
  return {
    languages: new Set(["typescript"]),
    dependencies: new Set(["react", "vscode"]),
    relativePaths: new Set(["package.json", "agents.md"]),
    installedExtensions: new Set<string>(),
    agentsMdText: "agents",
    isMonorepo: false,
    ...overrides
  };
}

const META_A: SkillMeta = {
  name: "react-testing",
  shaOrVersion: "1",
  skillType: "skill",
  description: "Help write tests for React components",
  category: "testing",
  triggers: { languages: ["typescript"], dependencies: ["react"], keywords: ["jest"] }
};

const META_B: SkillMeta = {
  name: "python-fastapi",
  shaOrVersion: "1",
  skillType: "skill",
  description: "FastAPI patterns",
  triggers: { dependencies: ["fastapi"] }
};

const META_RULE: SkillMeta = {
  name: "commit-style",
  shaOrVersion: "1",
  skillType: "cursor-rule",
  description: "Conventional commit rules"
};

describe("buildAskAgentPrompt", () => {
  it("includes workspace fingerprint and catalog candidates", () => {
    const prompt = buildAskAgentPrompt(makeProfile(), [META_A, META_B, META_RULE], []);
    expect(prompt).toContain("Workspace fingerprint");
    expect(prompt).toContain("Languages: typescript");
    expect(prompt).toContain("Dependencies: react, vscode");
    expect(prompt).toContain("**react-testing**");
    expect(prompt).toContain("**python-fastapi**");
    expect(prompt).toContain("**commit-style** (rule)");
  });

  it("excludes opted-in skills from candidates and lists them as installed", () => {
    const prompt = buildAskAgentPrompt(makeProfile(), [META_A, META_B], ["react-testing"]);
    expect(prompt).toContain("Already enabled in this workspace");
    expect(prompt).toContain("- react-testing");
    const candidatesSection = prompt.split("Catalog candidates")[1] ?? "";
    expect(candidatesSection).not.toContain("**react-testing**");
    expect(candidatesSection).toContain("**python-fastapi**");
  });

  it("notes when there are no candidates", () => {
    const prompt = buildAskAgentPrompt(makeProfile(), [], []);
    expect(prompt).toContain("Catalog candidates: (none");
  });

  it("ends with the manage skills hint", () => {
    const prompt = buildAskAgentPrompt(makeProfile(), [META_A], []);
    expect(prompt).toMatch(/Skill Sync: Manage AI Skills/);
  });
});

describe("seedChatWithPrompt", () => {
  beforeEach(() => {
    mockEnv.clipboard.writeText.mockClear();
    mockEnv.openExternal.mockReset();
    mockEnv.openExternal.mockResolvedValue(true);
    mockEnv.uriScheme = "cursor";
    mockEnv.appName = "Cursor";
    mockCommands.executeCommand.mockReset();
    mockCommands.getCommands.mockReset();
    mockCommands.getCommands.mockResolvedValue([]);
  });

  it("opens the Cursor deeplink with URL-encoded prompt and copies to clipboard", async () => {
    const result = await seedChatWithPrompt("hello world & friends");
    expect(result).toEqual({ opened: true, viaDeeplink: true });
    expect(mockEnv.clipboard.writeText).toHaveBeenCalledWith("hello world & friends");
    expect(mockEnv.openExternal).toHaveBeenCalledTimes(1);
    const arg = mockEnv.openExternal.mock.calls[0][0] as { toString: () => string };
    const uri = arg.toString();
    expect(uri.startsWith("cursor://anysphere.cursor-deeplink/prompt?text=")).toBe(true);
    expect(uri).toContain(encodeURIComponent("hello world & friends"));
  });

  it("trims oversized prompts to fit the deeplink budget", async () => {
    const big = "x".repeat(20000);
    await seedChatWithPrompt(big);
    const arg = mockEnv.openExternal.mock.calls[0][0] as { toString: () => string };
    const uri = arg.toString();
    expect(uri.length).toBeLessThanOrEqual(7500 + "cursor://anysphere.cursor-deeplink/prompt?text=".length + 200);
    expect(mockEnv.clipboard.writeText).toHaveBeenCalledWith(big);
  });

  it("falls back to chat command when not running in Cursor", async () => {
    mockEnv.uriScheme = "vscode";
    mockEnv.appName = "Visual Studio Code";
    mockCommands.getCommands.mockResolvedValue(["workbench.action.chat.open"]);
    mockCommands.executeCommand.mockResolvedValue(undefined);
    const result = await seedChatWithPrompt("hi");
    expect(mockEnv.openExternal).not.toHaveBeenCalled();
    expect(mockCommands.executeCommand).toHaveBeenCalledWith("workbench.action.chat.open", "hi");
    expect(result).toEqual({ opened: true, viaDeeplink: false });
  });

  it("returns opened:false when no chat surface is available", async () => {
    mockEnv.uriScheme = "vscode";
    mockEnv.appName = "Visual Studio Code";
    mockCommands.getCommands.mockResolvedValue([]);
    const result = await seedChatWithPrompt("hi");
    expect(result).toEqual({ opened: false, viaDeeplink: false });
    expect(mockEnv.clipboard.writeText).toHaveBeenCalledWith("hi");
  });
});
