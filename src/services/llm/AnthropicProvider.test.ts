/** @jest-environment node */
import * as vscode from "vscode";
import { AnthropicProvider } from "./AnthropicProvider";

describe("AnthropicProvider", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("parses SSE stream and emits text deltas", async () => {
    const d1 = JSON.stringify({
      type: "content_block_delta",
      index: 0,
      delta: { type: "text_delta", text: '{"r"' }
    });
    const d2 = JSON.stringify({
      type: "content_block_delta",
      index: 0,
      delta: { type: "text_delta", text: "}" }
    });
    const body = `event: content_block_delta\ndata: ${d1}\n\n event: content_block_delta\ndata: ${d2}\n\n`;

    global.fetch = jest.fn().mockResolvedValue(
      new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } })
    );

    const sink = jest.fn();
    const p = new AnthropicProvider("sk-ant-test", "claude-3-5-haiku-20241022");
    const out = await p.complete("prompt", new vscode.CancellationTokenSource().token, sink);

    expect(out).toContain('"r"');
    expect(sink.mock.calls.filter((c) => c[0].type === "text").length).toBeGreaterThanOrEqual(1);
  });

  it("emits thinking_delta as thinking stream events", async () => {
    const d = JSON.stringify({
      type: "content_block_delta",
      index: 0,
      delta: { type: "thinking_delta", thinking: "plan" }
    });
    const body = `event: content_block_delta\ndata: ${d}\n\n`;

    global.fetch = jest.fn().mockResolvedValue(
      new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } })
    );

    const sink = jest.fn();
    const p = new AnthropicProvider("sk-ant-test", "claude-3-5-haiku-20241022");
    await p.complete("p", new vscode.CancellationTokenSource().token, sink);

    expect(sink.mock.calls.some((c) => c[0].type === "thinking")).toBe(true);
  });
});
