import * as vscode from "vscode";
import { normalizeToolBlockForStream } from "./normalizeToolStream";
import { wrapPromptForCursorSdkAgentRanking } from "./promptBuilder";
import type { LlmStreamEvent, LlmStreamSink } from "./streamEvents";

const HEARTBEAT_QUIET_MS = 3800;
const HEARTBEAT_TICK_MS = 1200;
const HEARTBEAT_MESSAGES = [
  "Still working — the agent may be running tools or searching the repo…",
  "Collecting results; discovery sources or large trees can take a while…",
  "Waiting for the next chunk from the model…"
];

function emitAssistantBlocks(content: unknown, providerId: string, sink?: LlmStreamSink): void {
  if (!sink || !Array.isArray(content)) {
    return;
  }
  for (const block of content) {
    if (!block || typeof block !== "object") {
      continue;
    }
    const b = block as Record<string, unknown>;
    const t = b.type;
    if (t === "text" && typeof b.text === "string" && b.text.length > 0) {
      sink({ type: "text", providerId, delta: b.text });
    } else if (t === "thinking") {
      const th = typeof b.thinking === "string" ? b.thinking : "";
      if (th.length > 0) {
        sink({ type: "thinking", providerId, delta: th });
      }
    } else if (t === "tool_use" || t === "function") {
      const { name, input, id } = normalizeToolBlockForStream(b);
      sink({
        type: "toolUse",
        providerId,
        name,
        input,
        id
      });
    } else if (t === "tool_result") {
      const preview =
        typeof b.content === "string"
          ? b.content.slice(0, 500)
          : b.content !== undefined
            ? JSON.stringify(b.content).slice(0, 500)
            : undefined;
      const isErr = Boolean(b.is_error);
      sink({
        type: "toolResult",
        providerId,
        id: typeof b.tool_use_id === "string" ? b.tool_use_id : typeof b.id === "string" ? b.id : undefined,
        ok: !isErr,
        preview
      });
    }
  }
}

function mapSdkStreamEvent(ev: unknown, providerId: string, sink?: LlmStreamSink): void {
  if (!sink || typeof ev !== "object" || ev === null) {
    return;
  }
  const e = ev as Record<string, unknown>;
  const evType = typeof e.type === "string" ? e.type : "";

  if (evType === "assistant" && e.message && typeof e.message === "object") {
    const msg = e.message as Record<string, unknown>;
    emitAssistantBlocks(msg.content, providerId, sink);
    if (typeof msg.text === "string" && msg.text.length > 0) {
      sink({ type: "text", providerId, delta: msg.text });
    }
    if (typeof msg.thinking === "string" && msg.thinking.length > 0) {
      sink({ type: "thinking", providerId, delta: msg.thinking });
    }
    return;
  }

  /** Top-level tool events (shape varies by SDK/runtime). */
  if (evType === "tool_use" || evType === "tool-call" || evType === "tool_call" || evType === "function") {
    const { name, input, id } = normalizeToolBlockForStream(e);
    sink({
      type: "toolUse",
      providerId,
      name,
      input,
      id
    });
    return;
  }

  /** Some streams emit content blocks without wrapping in `type: "assistant"`. */
  if (evType !== "assistant" && Array.isArray(e.content)) {
    emitAssistantBlocks(e.content, providerId, sink);
  }

  if (typeof e.text === "string" && e.text.length > 0) {
    sink({ type: "text", providerId, delta: e.text });
  }
  if (typeof e.thinking === "string" && e.thinking.length > 0) {
    sink({ type: "thinking", providerId, delta: e.thinking });
  }
}

export class CursorSdkProvider {
  public readonly id = "cursor-sdk" as const;

  public constructor(
    private readonly apiKey: string,
    private readonly modelId: string,
    private readonly workspaceRoot: string | undefined
  ) {}

  public async complete(
    prompt: string,
    token: vscode.CancellationToken,
    stream?: LlmStreamSink
  ): Promise<string | undefined> {
    if (!this.apiKey.trim() || token.isCancellationRequested) {
      return undefined;
    }

    try {
      const mod = await import("@cursor/sdk");
      const cwd = this.workspaceRoot ? this.workspaceRoot : process.cwd();
      const agent = await mod.Agent.create({
        apiKey: this.apiKey,
        model: { id: this.modelId },
        local: { cwd },
        name: "skill-sync-recommendations"
      });

      try {
        let run: Awaited<ReturnType<(typeof agent)["send"]>>;
        try {
          run = await agent.send(wrapPromptForCursorSdkAgentRanking(prompt));
        } catch (sendErr) {
          stream?.({
            type: "error",
            providerId: this.id,
            message: sendErr instanceof Error ? sendErr.message : String(sendErr)
          });
          return undefined;
        }

        stream?.({ type: "status", providerId: this.id, message: "Streaming agent response…" });

        let lastActivity = Date.now();
        const touch = (): void => {
          lastActivity = Date.now();
        };
        let hbIdx = 0;
        const wrappedSink: LlmStreamSink | undefined = stream
          ? (evt: LlmStreamEvent) => {
              touch();
              stream(evt);
            }
          : undefined;

        const hbTimer = setInterval(() => {
          if (token.isCancellationRequested) {
            return;
          }
          if (Date.now() - lastActivity < HEARTBEAT_QUIET_MS) {
            return;
          }
          wrappedSink?.({
            type: "status",
            providerId: this.id,
            message: HEARTBEAT_MESSAGES[hbIdx % HEARTBEAT_MESSAGES.length]!
          });
          hbIdx += 1;
          touch();
        }, HEARTBEAT_TICK_MS);

        try {
          if (!run.supports || run.supports("stream")) {
            for await (const ev of run.stream()) {
              touch();
              if (token.isCancellationRequested) {
                if (run.supports?.("cancel") && run.cancel) {
                  await run.cancel();
                }
                break;
              }
              mapSdkStreamEvent(ev, this.id, wrappedSink);
            }
          }
        } catch (streamErr) {
          stream?.({
            type: "error",
            providerId: this.id,
            message: streamErr instanceof Error ? streamErr.message : String(streamErr)
          });
        } finally {
          clearInterval(hbTimer);
        }

        const result = await run.wait();
        if (result.status === "error") {
          stream?.({
            type: "error",
            providerId: this.id,
            message: "Agent run ended with error status"
          });
          return undefined;
        }
        if (token.isCancellationRequested) {
          return undefined;
        }
        if (result.status !== "finished") {
          return undefined;
        }
        const text = result.result?.trim();
        return text || undefined;
      } finally {
        const dispose = (agent as { [Symbol.asyncDispose]?: () => Promise<void> })[Symbol.asyncDispose];
        if (typeof dispose === "function") {
          await dispose.call(agent);
        }
      }
    } catch (err) {
      stream?.({
        type: "error",
        providerId: this.id,
        message: err instanceof Error ? err.message : String(err)
      });
      return undefined;
    }
  }
}
