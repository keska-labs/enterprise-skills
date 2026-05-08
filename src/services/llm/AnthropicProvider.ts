import * as vscode from "vscode";
import type { LlmStreamSink } from "./streamEvents";

export class AnthropicProvider {
  public readonly id = "anthropic" as const;

  public constructor(
    private readonly apiKey: string,
    private readonly model: string
  ) {}

  public async complete(
    prompt: string,
    token: vscode.CancellationToken,
    stream?: LlmStreamSink
  ): Promise<string | undefined> {
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
          stream: true,
          messages: [{ role: "user", content: prompt }]
        }),
        signal: controller.signal
      });

      if (!res.ok || !res.body) {
        return undefined;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let full = "";

      while (!token.isCancellationRequested) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        buffer += decoder.decode(value, { stream: true });

        let sep = buffer.indexOf("\n\n");
        while (sep !== -1) {
          const rawEvent = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          sep = buffer.indexOf("\n\n");

          let dataLine: string | null = null;
          for (const line of rawEvent.split("\n")) {
            if (line.startsWith("data:")) {
              dataLine = line.slice("data:".length).trim();
            }
          }
          if (!dataLine) {
            continue;
          }
          try {
            const payload = JSON.parse(dataLine) as Record<string, unknown>;
            if (payload.type === "content_block_delta") {
              const delta = payload.delta as Record<string, unknown> | undefined;
              if (!delta) {
                continue;
              }
              if (delta.type === "text_delta" && typeof delta.text === "string") {
                full += delta.text;
                stream?.({ type: "text", providerId: this.id, delta: delta.text });
              } else if (delta.type === "thinking_delta" && typeof delta.thinking === "string") {
                stream?.({ type: "thinking", providerId: this.id, delta: delta.thinking });
              }
            }
          } catch {
            /* skip */
          }
        }
      }

      const trimmed = full.trim();
      return trimmed || undefined;
    } catch {
      return undefined;
    } finally {
      sub.dispose();
    }
  }
}
