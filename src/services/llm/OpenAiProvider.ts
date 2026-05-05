import * as vscode from "vscode";

export class OpenAiProvider {
  public readonly id = "openai" as const;

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
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: this.model,
          temperature: 0.2,
          response_format: { type: "json_object" },
          messages: [{ role: "user", content: prompt }]
        }),
        signal: controller.signal
      });

      if (!res.ok) {
        return undefined;
      }

      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = data.choices?.[0]?.message?.content?.trim();
      return content || undefined;
    } catch {
      return undefined;
    } finally {
      sub.dispose();
    }
  }
}
