import type { ExtensionMessage } from "../../webview-ui/types/messages";
import type { LlmStreamEvent, LlmStreamSink } from "../../webview-ui/types/llmStreamEvents";

/**
 * Coalesce rapid text/thinking deltas and throttle postMessage to the webview.
 */
export function createRecommendationsStreamBridge(
  post: (msg: ExtensionMessage) => void,
  flushMs = 50
): { eventSink: LlmStreamSink; flush: () => void } {
  let pendingText: { providerId: string; delta: string } | null = null;
  let pendingThinking: { providerId: string; delta: string } | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flushText = (): void => {
    if (pendingText && pendingText.delta.length > 0) {
      post({
        type: "recommendationsStreamEvent",
        event: { type: "text", providerId: pendingText.providerId, delta: pendingText.delta }
      });
    }
    pendingText = null;
  };

  const flushThinking = (): void => {
    if (pendingThinking && pendingThinking.delta.length > 0) {
      post({
        type: "recommendationsStreamEvent",
        event: { type: "thinking", providerId: pendingThinking.providerId, delta: pendingThinking.delta }
      });
    }
    pendingThinking = null;
  };

  const flushAll = (): void => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    flushText();
    flushThinking();
  };

  const scheduleFlush = (): void => {
    if (timer !== null) {
      return;
    }
    timer = setTimeout(() => {
      timer = null;
      flushText();
      flushThinking();
    }, flushMs);
  };

  const eventSink = (event: LlmStreamEvent): void => {
    if (event.type === "text") {
      if (!pendingText || pendingText.providerId !== event.providerId) {
        flushText();
        pendingText = { providerId: event.providerId, delta: event.delta };
      } else {
        pendingText.delta += event.delta;
      }
      if (event.delta.includes("\n")) {
        flushAll();
        scheduleFlush();
        return;
      }
      scheduleFlush();
      return;
    }

    /** Reasoning tokens: post immediately so long gaps between tool steps still feel alive. */
    if (event.type === "thinking") {
      flushAll();
      post({ type: "recommendationsStreamEvent", event });
      return;
    }

    flushAll();
    post({ type: "recommendationsStreamEvent", event });
  };

  return { eventSink, flush: flushAll };
}
