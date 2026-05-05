import * as vscode from "vscode";

export class AnthropicProvider {
  public readonly id = "anthropic" as const;

  public constructor(
    private readonly apiKey: string,
    private readonly model: string
  ) { }

  public async complete(prompt: string, token: vscode.CancellationToken): Promise<string | undefined> {
    if (!this.apiKey.trim()) {
      return undefined;
    }

    const controller = new AbortController();
    const sub = token.onCancellationRequested(() => controller.abort());

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 4096,
          temperature: 0.2,
          messages: [{ role: "user", content: prompt }]
        }),
        signal: controller.signal
      });

      if (!res.ok) {
        return undefined;
      }

      const data = (await res.json()) as {
        content?: Array<{ type?: string; text?: string }>;
      };
      const block = data.content?.find((c) => c.type === "text");
      const text = block?.text?.trim();
      return text || undefined;
    } catch {
      return undefined;
    } finally {
      sub.dispose();
    }
  }
}
