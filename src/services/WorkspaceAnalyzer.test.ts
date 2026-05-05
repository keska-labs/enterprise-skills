import * as vscode from "vscode";
import { WorkspaceAnalyzer } from "./WorkspaceAnalyzer";

describe("WorkspaceAnalyzer", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("collects npm dependencies and languages from the workspace", async () => {
    const findFiles = vscode.workspace.findFiles as jest.Mock;
    findFiles.mockImplementation(async (pattern: string) => {
      const p = String(pattern);
      if (p.includes("package.json")) {
        return [vscode.Uri.file("/tmp/workspace/packages/a/package.json")];
      }
      if (p === "**/*") {
        return [vscode.Uri.file("/tmp/workspace/packages/a/src/index.ts")];
      }
      return [];
    });

    const readFile = vscode.workspace.fs.readFile as jest.Mock;
    readFile.mockResolvedValue(
      new Uint8Array(Buffer.from(JSON.stringify({ dependencies: { react: "^18.0.0" }, devDependencies: { typescript: "^5" } })))
    );

    const analyzer = new WorkspaceAnalyzer();
    const profile = await analyzer.analyze();

    expect(profile.dependencies.has("react")).toBe(true);
    expect(profile.dependencies.has("typescript")).toBe(true);
    expect(profile.languages.has("typescript")).toBe(true);
  });
});
