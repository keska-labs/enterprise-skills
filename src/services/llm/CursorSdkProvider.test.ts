import * as vscode from "vscode";
import { CursorSdkProvider } from "./CursorSdkProvider";

const mockDispose = jest.fn().mockResolvedValue(undefined);

jest.mock("@cursor/sdk", () => {
  async function* streamGen(): AsyncGenerator<{
    type: string;
    message: { content: Array<{ type: string; text?: string; thinking?: string; name?: string; id?: string; input?: unknown }> };
  }> {
    yield {
      type: "assistant",
      message: { content: [{ type: "thinking", thinking: "pick skills" }] }
    };
    yield {
      type: "assistant",
      message: {
        content: [{ type: "tool_use", name: "read_file", id: "t1", input: { path: "x" } }]
      }
    };
    yield {
      type: "assistant",
      message: { content: [{ type: "text", text: '{"recommendations":[]}' }] }
    };
  }

  return {
    Agent: {
      create: jest.fn(async () => ({
        send: jest.fn(async () => ({
          stream: () => streamGen(),
          wait: jest.fn(async () => ({ status: "finished", result: '{"recommendations":[]}' })),
          supports: (op: string) => op === "stream" || op === "cancel",
          cancel: jest.fn().mockResolvedValue(undefined)
        })),
        [Symbol.asyncDispose]: mockDispose
      }))
    }
  };
});

describe("CursorSdkProvider", () => {
  beforeEach(() => {
    mockDispose.mockClear();
  });

  it("streams SDK events and returns finished result text", async () => {
    const sink = jest.fn();
    const p = new CursorSdkProvider("cursor_test_key", "composer-2", undefined);
    const out = await p.complete("rank skills", new vscode.CancellationTokenSource().token, sink);

    expect(out).toBe('{"recommendations":[]}');
    expect(sink.mock.calls.some((c) => c[0].type === "thinking")).toBe(true);
    expect(sink.mock.calls.some((c) => c[0].type === "toolUse")).toBe(true);
    expect(sink.mock.calls.some((c) => c[0].type === "text")).toBe(true);
    expect(mockDispose).toHaveBeenCalledTimes(1);
  });

  it("returns undefined when api key empty", async () => {
    const p = new CursorSdkProvider("  ", "composer-2", undefined);
    const out = await p.complete("x", new vscode.CancellationTokenSource().token);
    expect(out).toBeUndefined();
  });

  it("sends the SDK-wrapped prompt to the agent", async () => {
    const p = new CursorSdkProvider("cursor_test_key", "composer-2", undefined);
    await p.complete("rank skills", new vscode.CancellationTokenSource().token);

    const mod = await import("@cursor/sdk");
    const createMock = mod.Agent.create as jest.Mock;
    const agentInstance = await createMock.mock.results[0].value;
    const sendMock = agentInstance.send as jest.Mock;
    const payload = sendMock.mock.calls[0][0] as string;
    expect(payload).toContain("[Skill Manager — streaming]");
    expect(payload).toContain("rank skills");
  });
});
