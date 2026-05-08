/**
 * Serializable LLM stream events for recommendations — shared by extension host and webview.
 */
export type LlmStreamEvent =
  | { type: "status"; providerId: string; message: string }
  | { type: "text"; providerId: string; delta: string }
  | { type: "thinking"; providerId: string; delta: string }
  | { type: "toolUse"; providerId: string; name: string; input?: unknown; id?: string }
  | { type: "toolResult"; providerId: string; id?: string; ok: boolean; preview?: string }
  | { type: "error"; providerId: string; message: string };

export type LlmStreamSink = (event: LlmStreamEvent) => void;
