/** @jest-environment node */
import * as vscode from "vscode";
import { OpenAiProvider } from "./OpenAiProvider";

function streamResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  let i = 0;
  return new Response(
    new ReadableStream<Uint8Array>({
      pull(controller) {
        if (i >= chunks.length) {
          controller.close();
          return;
        }
        controller.enqueue(encoder.encode(chunks[i]));
        i += 1;
      }
    }),
    { status: 200, headers: { "Content-Type": "text/event-stream" } }
  );
}

describe("OpenAiProvider", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("aggregates streamed deltas and emits stream events", async () => {
    const piece = JSON.stringify({ choices: [{ delta: { content: '{"' } }] });
    const piece2 = JSON.stringify({ choices: [{ delta: { content: 'foo"}' } }] });
    global.fetch = jest.fn().mockResolvedValue(
      streamResponse([`data: ${piece}\n\n`, `data: ${piece2}\n\n`, "data: [DONE]\n\n"])
    );

    const sink = jest.fn();
    const p = new OpenAiProvider("sk-test", "gpt-4o-mini");
    const out = await p.complete("prompt", new vscode.CancellationTokenSource().token, sink);

    expect(out).toContain("foo");
    expect(sink.mock.calls.some((c) => c[0].type === "text")).toBe(true);
  });

  it("emits thinking deltas when present", async () => {
    const line = JSON.stringify({ choices: [{ delta: { reasoning: "step" } }] });
    global.fetch = jest.fn().mockResolvedValue(streamResponse([`data: ${line}\n\n`, "data: [DONE]\n\n"]));

    const sink = jest.fn();
    const p = new OpenAiProvider("sk-test", "gpt-4o-mini");
    await p.complete("p", new vscode.CancellationTokenSource().token, sink);

    expect(sink.mock.calls.some((c) => c[0].type === "thinking")).toBe(true);
  });
});
