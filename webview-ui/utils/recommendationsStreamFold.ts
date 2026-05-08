import type { LlmStreamEvent } from "../types/llmStreamEvents";
import { extractPrimaryToolDetail } from "./recommendationToolLabels";

const MAX_PAST_LINES = 8;

export type StreamActive =
  | { kind: "thinking"; body: string }
  | {
      kind: "tool_running";
      toolName: string;
      command?: string;
      id?: string;
      input?: unknown;
    }
  | {
      kind: "tool_done";
      toolName: string;
      command?: string;
      id?: string;
      ok: boolean;
      preview?: string;
    }
  | { kind: "response"; body: string };

export interface FoldedPastLine {
  key: string;
  /** Short verb prefix, e.g. "Thought", "shell", "read_file". */
  tag: string;
  /** Detail/command/output snippet — may be empty. */
  text: string;
  /** True when the step ended in error. */
  error?: boolean;
}

export interface FoldedRecommendationStream {
  /** One-line recaps of completed beats (oldest first). */
  past: FoldedPastLine[];
  /** Single live slot — same box updates until sealed into `past`. */
  active: StreamActive | null;
  /** Last error in the stream (if any). */
  errorMessage?: string;
}

function clip(text: string, max: number): string {
  const one = text.replace(/\s+/g, " ").trim();
  if (!one) {
    return "";
  }
  return one.length > max ? `${one.slice(0, max - 1)}…` : one;
}

/**
 * Collapse a flat LLM event list into Cursor-style: short past lines + one active pane.
 *
 * Tool semantics:
 * - Multiple `toolUse` events for the same tool call (same `id`, or same name while args
 *   stream in) update the active slot in place rather than creating new entries.
 * - A bare tool name with no detail is not pushed to `past` until we have a `toolResult`.
 */
export function foldRecommendationStream(events: LlmStreamEvent[]): FoldedRecommendationStream {
  const past: FoldedPastLine[] = [];
  let active: StreamActive | null = null;
  let lastError: string | undefined;
  let pastKeySeq = 0;

  const pushPast = (line: Omit<FoldedPastLine, "key">): void => {
    const tag = line.tag.replace(/\s+/g, " ").trim();
    const text = line.text.replace(/\s+/g, " ").trim();
    if (!tag && !text) {
      return;
    }
    const last = past[past.length - 1];
    if (last && last.tag === tag && last.text === text) {
      return;
    }
    past.push({ key: `p${pastKeySeq++}`, tag, text, error: line.error });
    while (past.length > MAX_PAST_LINES) {
      past.shift();
    }
  };

  const sealThinking = (): void => {
    if (active?.kind === "thinking") {
      const line = clip(active.body, 140);
      if (line) {
        pushPast({ tag: "Thought", text: line });
      }
      active = null;
    }
  };

  const sealToolRunning = (): void => {
    if (active?.kind === "tool_running") {
      if (active.command) {
        pushPast({ tag: active.toolName, text: active.command });
      }
      // Bare name with no detail: drop silently to avoid noise like "shell…" rows.
      active = null;
    }
  };

  const sealToolDone = (): void => {
    if (active?.kind === "tool_done") {
      const text =
        active.command && active.preview
          ? `${active.command} → ${clip(active.preview, 80)}`
          : active.command
            ? active.command
            : active.preview
              ? clip(active.preview, 100)
              : active.ok
                ? "done"
                : "failed";
      pushPast({ tag: active.toolName, text, error: !active.ok });
      active = null;
    }
  };

  const sealResponse = (): void => {
    if (active?.kind === "response") {
      const line = clip(active.body, 140);
      if (line) {
        pushPast({ tag: "Response", text: line });
      }
      active = null;
    }
  };

  const sealAny = (): void => {
    sealThinking();
    sealToolRunning();
    sealToolDone();
    sealResponse();
  };

  for (const ev of events) {
    if (ev.type === "error") {
      lastError = ev.message;
      continue;
    }
    if (ev.type === "status") {
      continue;
    }

    if (ev.type === "thinking") {
      if (active && active.kind !== "thinking") {
        sealAny();
      }
      if (active?.kind === "thinking") {
        active = { kind: "thinking", body: active.body + ev.delta };
      } else {
        active = { kind: "thinking", body: ev.delta };
      }
      continue;
    }

    if (ev.type === "toolUse") {
      const command = extractPrimaryToolDetail(ev.name, ev.input);
      const sameAsActive =
        active?.kind === "tool_running" &&
        ((ev.id && active.id && ev.id === active.id) ||
          (!ev.id && !active.id && active.toolName === ev.name && !active.command));

      if (sameAsActive && active?.kind === "tool_running") {
        active = {
          kind: "tool_running",
          toolName: ev.name,
          command: command ?? active.command,
          id: ev.id ?? active.id,
          input: ev.input ?? active.input
        };
        continue;
      }

      if (active && active.kind !== "tool_running") {
        sealAny();
      } else if (active?.kind === "tool_running") {
        sealToolRunning();
      }

      active = {
        kind: "tool_running",
        toolName: ev.name,
        command: command ?? undefined,
        id: ev.id,
        input: ev.input
      };
      continue;
    }

    if (ev.type === "toolResult") {
      if (active?.kind === "tool_running") {
        const matches = ev.id ? active.id === ev.id : true;
        if (matches) {
          active = {
            kind: "tool_done",
            toolName: active.toolName,
            command: active.command,
            id: active.id,
            ok: ev.ok,
            preview: ev.preview?.replace(/\s+/g, " ").trim()
          };
          continue;
        }
      }
      // Result without a matching call — log it as a standalone past row.
      pushPast({
        tag: "Result",
        text: ev.preview?.replace(/\s+/g, " ").trim() || (ev.ok ? "done" : "failed"),
        error: !ev.ok
      });
      continue;
    }

    if (ev.type === "text") {
      if (active && active.kind !== "response") {
        sealAny();
      }
      if (active?.kind === "response") {
        active = { kind: "response", body: active.body + ev.delta };
      } else {
        active = { kind: "response", body: ev.delta };
      }
    }
  }

  return { past, active, errorMessage: lastError };
}

export function statusPillFromFold(
  folded: FoldedRecommendationStream,
  rawEvents: LlmStreamEvent[]
): string {
  const a = folded.active;
  if (a?.kind === "thinking") {
    return "Thinking";
  }
  if (a?.kind === "tool_running") {
    return a.command ? `Running · ${clip(a.command, 56)}` : `Running · ${a.toolName}`;
  }
  if (a?.kind === "tool_done") {
    return a.ok ? `Done · ${a.toolName}` : `Failed · ${a.toolName}`;
  }
  if (a?.kind === "response") {
    return "Writing";
  }
  const last = rawEvents[rawEvents.length - 1];
  if (!last) {
    return "Working";
  }
  switch (last.type) {
    case "status":
      return last.message;
    case "error":
      return "Error";
    case "toolUse": {
      const detail = extractPrimaryToolDetail(last.name, last.input);
      return detail ? `Calling · ${clip(detail, 56)}` : `Calling · ${last.name}`;
    }
    case "thinking":
      return "Thinking";
    case "text":
      return "Writing";
    case "toolResult":
      return last.ok ? "Tool finished" : "Tool failed";
    default:
      return "Working";
  }
}
