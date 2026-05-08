import { createRecommendationsStreamBridge } from "./recommendationsStreamBridge";
import type { ExtensionMessage } from "../../webview-ui/types/messages";

describe("createRecommendationsStreamBridge", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("coalesces text deltas and flushes on timer", () => {
    const posted: ExtensionMessage[] = [];
    const { eventSink, flush } = createRecommendationsStreamBridge((msg) => posted.push(msg), 50);

    eventSink({ type: "text", providerId: "openai", delta: "a" });
    eventSink({ type: "text", providerId: "openai", delta: "b" });
    expect(posted.length).toBe(0);

    jest.advanceTimersByTime(50);
    expect(posted.length).toBe(1);
    expect(posted[0]).toEqual({
      type: "recommendationsStreamEvent",
      event: { type: "text", providerId: "openai", delta: "ab" }
    });

    flush();
  });

  it("flushes text immediately on newline", () => {
    const posted: ExtensionMessage[] = [];
    const { eventSink, flush } = createRecommendationsStreamBridge((msg) => posted.push(msg), 50);

    eventSink({ type: "text", providerId: "openai", delta: "line\n" });
    expect(posted.length).toBe(1);
    expect(posted[0]).toEqual({
      type: "recommendationsStreamEvent",
      event: { type: "text", providerId: "openai", delta: "line\n" }
    });

    flush();
  });

  it("posts thinking events immediately without waiting for throttle", () => {
    const posted: ExtensionMessage[] = [];
    const { eventSink, flush } = createRecommendationsStreamBridge((msg) => posted.push(msg), 50);

    eventSink({ type: "thinking", providerId: "openai", delta: "a" });
    expect(posted.length).toBe(1);
    eventSink({ type: "thinking", providerId: "openai", delta: "b" });
    expect(posted.length).toBe(2);

    flush();
  });

  it("posts non-text events immediately", () => {
    const posted: ExtensionMessage[] = [];
    const { eventSink, flush } = createRecommendationsStreamBridge((msg) => posted.push(msg));

    eventSink({ type: "status", providerId: "vscode-lm", message: "Trying…" });
    expect(posted.length).toBe(1);
    flush();
  });
});
