import * as vscode from "vscode";

export class CursorSdkProvider {
  public readonly id = "cursor-sdk" as const;

  public constructor(
    private readonly apiKey: string,
    private readonly modelId: string,
    private readonly workspaceRoot: string | undefined
  ) {}

  public async complete(prompt: string, token: vscode.CancellationToken): Promise<string | undefined> {
    if (!this.apiKey.trim() || token.isCancellationRequested) {
      return undefined;
    }

    try {
      const mod = await import("@cursor/sdk");
      const runResult = await mod.Agent.prompt(prompt, {
        apiKey: this.apiKey,
        model: { id: this.modelId },
        local: this.workspaceRoot ? { cwd: this.workspaceRoot } : { cwd: process.cwd() },
        name: "skill-sync-recommendations"
      });

      const text = runResult.result?.trim();
      return text || undefined;
    } catch {
      return undefined;
    }
  }
}
