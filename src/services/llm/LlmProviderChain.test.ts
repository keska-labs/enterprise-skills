import * as vscode from "vscode";
import { tryLlmCompleters } from "./LlmProviderChain";
import { Logger } from "../../utils/logger";

function mockLogger(): Logger {
  return {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    show: jest.fn(),
    dispose: jest.fn()
  } as unknown as Logger;
}

describe("tryLlmCompleters", () => {
  const token = new vscode.CancellationTokenSource().token;

  it("returns first non-empty completion", async () => {
    const out = await tryLlmCompleters(
      [
        { id: "vscode-lm", complete: async () => undefined },
        { id: "openai", complete: async () => '{"ok":true}' }
      ],
      "prompt",
      token,
      mockLogger()
    );
    expect(out?.providerId).toBe("openai");
    expect(out?.raw).toBe('{"ok":true}');
  });

  it("continues when a provider throws", async () => {
    const out = await tryLlmCompleters(
      [
        {
          id: "vscode-lm",
          complete: async () => {
            throw new Error("boom");
          }
        },
        { id: "anthropic", complete: async () => "hello" }
      ],
      "p",
      token,
      mockLogger()
    );
    expect(out?.providerId).toBe("anthropic");
  });

  it("emits status and forwards stream events from completers", async () => {
    const stream = jest.fn();
    const out = await tryLlmCompleters(
      [
        {
          id: "vscode-lm",
          complete: async (_p, _t, s) => {
            s?.({ type: "text", providerId: "vscode-lm", delta: "x" });
            return undefined;
          }
        },
        { id: "openai", complete: async () => '{"ok":true}' }
      ],
      "prompt",
      token,
      mockLogger(),
      stream
    );
    expect(out?.providerId).toBe("openai");
    expect(stream.mock.calls.some((c) => c[0].type === "status" && c[0].providerId === "vscode-lm")).toBe(true);
    expect(stream.mock.calls.some((c) => c[0].type === "text")).toBe(true);
  });
});
