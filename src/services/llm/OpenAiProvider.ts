import * as vscode from "vscode";
import type { LlmStreamSink } from "./streamEvents";

export class OpenAiProvider {
  public readonly id = "openai" as const;

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
      let carry = "";
      let full = "";

      while (!token.isCancellationRequested) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        carry += decoder.decode(value, { stream: true });
        const lines = carry.split("\n");
        carry = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) {
            continue;
          }
          const data = trimmed.slice("data:".length).trim();
          if (data === "[DONE]") {
            continue;
          }
          try {
            const json = JSON.parse(data) as {
              choices?: Array<{
                delta?: {
                  content?: string | null;
                  reasoning?: string | null;
                  reasoning_content?: string | null;
                };
              }>;
            };
            const delta = json.choices?.[0]?.delta;
            const content = delta?.content;
            if (typeof content === "string" && content.length > 0) {
              full += content;
              stream?.({ type: "text", providerId: this.id, delta: content });
            }
            const reasoning = delta?.reasoning ?? delta?.reasoning_content;
            if (typeof reasoning === "string" && reasoning.length > 0) {
              stream?.({ type: "thinking", providerId: this.id, delta: reasoning });
            }
          } catch {
            /* skip malformed SSE JSON */
          }
        }
      }

      const tail = carry.trim();
      if (tail.startsWith("data:")) {
        const data = tail.slice("data:".length).trim();
        if (data && data !== "[DONE]") {
          try {
            const json = JSON.parse(data) as {
              choices?: Array<{
                delta?: { content?: string | null; reasoning?: string | null; reasoning_content?: string | null };
              }>;
            };
            const delta = json.choices?.[0]?.delta;
            const content = delta?.content;
            if (typeof content === "string" && content.length > 0) {
              full += content;
              stream?.({ type: "text", providerId: this.id, delta: content });
            }
            const reasoning = delta?.reasoning ?? delta?.reasoning_content;
            if (typeof reasoning === "string" && reasoning.length > 0) {
              stream?.({ type: "thinking", providerId: this.id, delta: reasoning });
            }
          } catch {
            /* ignore */
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
