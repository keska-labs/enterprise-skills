import type { LlmStreamEvent } from "../types/llmStreamEvents";
import { foldRecommendationStream, statusPillFromFold } from "./recommendationsStreamFold";

const P = "cursor-sdk";

describe("foldRecommendationStream", () => {
  it("keeps one thinking slot that grows with deltas", () => {
    const folded = foldRecommendationStream([
      { type: "thinking", providerId: P, delta: "hello " },
      { type: "thinking", providerId: P, delta: "world" }
    ]);
    expect(folded.past).toEqual([]);
    expect(folded.active).toEqual({ kind: "thinking", body: "hello world" });
  });

  it("seals thinking into past when a tool starts, then morphs tool to done", () => {
    const folded = foldRecommendationStream([
      { type: "thinking", providerId: P, delta: "plan" },
      { type: "toolUse", providerId: P, name: "read_file", input: { path: "a.ts" }, id: "t1" },
      { type: "toolResult", providerId: P, ok: true, preview: "ok", id: "t1" }
    ]);
    expect(folded.past.some((row) => row.tag === "Thought")).toBe(true);
    expect(folded.active?.kind).toBe("tool_done");
    if (folded.active?.kind === "tool_done") {
      expect(folded.active.toolName).toBe("read_file");
      expect(folded.active.command).toBe("a.ts");
      expect(folded.active.ok).toBe(true);
      expect(folded.active.preview).toBe("ok");
    }
  });

  it("merges multiple toolUse updates with the same id rather than sealing", () => {
    const folded = foldRecommendationStream([
      { type: "toolUse", providerId: P, name: "shell", input: undefined, id: "c1" },
      { type: "toolUse", providerId: P, name: "shell", input: { command: "git status" }, id: "c1" }
    ]);
    expect(folded.past).toEqual([]);
    expect(folded.active).toMatchObject({
      kind: "tool_running",
      toolName: "shell",
      command: "git status",
      id: "c1"
    });
  });

  it("does not push a bare tool name to past when a new tool replaces a still-empty one", () => {
    const folded = foldRecommendationStream([
      { type: "toolUse", providerId: P, name: "shell", input: undefined, id: "a" },
      { type: "toolUse", providerId: P, name: "read_file", input: { path: "x.ts" }, id: "b" }
    ]);
    expect(folded.past).toEqual([]);
    expect(folded.active?.kind).toBe("tool_running");
  });

  it("pushes tool_done with command + preview into past when sealed", () => {
    const folded = foldRecommendationStream([
      { type: "toolUse", providerId: P, name: "shell", input: { command: "ls" }, id: "x" },
      { type: "toolResult", providerId: P, ok: true, preview: "a\nb", id: "x" },
      { type: "text", providerId: P, delta: '{"r":1}' }
    ]);
    const last = folded.past[folded.past.length - 1];
    expect(last?.tag).toBe("shell");
    expect(last?.text).toBe("ls → a b");
    expect(folded.active).toEqual({ kind: "response", body: '{"r":1}' });
  });

  it("captures the last error message", () => {
    const folded = foldRecommendationStream([
      { type: "text", providerId: P, delta: "x" },
      { type: "error", providerId: P, message: "boom" }
    ]);
    expect(folded.errorMessage).toBe("boom");
  });

  it("caps past lines", () => {
    const events: LlmStreamEvent[] = [];
    for (let i = 0; i < 15; i++) {
      events.push({ type: "thinking", providerId: P, delta: `t${i}` });
      events.push({ type: "text", providerId: P, delta: "." });
    }
    const folded = foldRecommendationStream(events);
    expect(folded.past.length).toBeLessThanOrEqual(8);
  });
});

describe("statusPillFromFold", () => {
  it("reflects active phase (thinking)", () => {
    const folded = foldRecommendationStream([{ type: "thinking", providerId: P, delta: "x" }]);
    expect(statusPillFromFold(folded, [])).toBe("Thinking");
  });

  it("includes command when a tool is running", () => {
    const folded = foldRecommendationStream([
      { type: "toolUse", providerId: P, name: "shell", input: { command: "git status" }, id: "1" }
    ]);
    expect(statusPillFromFold(folded, [])).toContain("git status");
  });

  it("falls back to last raw event when idle", () => {
    const events: LlmStreamEvent[] = [{ type: "status", providerId: P, message: "Ping" }];
    const folded = foldRecommendationStream(events);
    expect(statusPillFromFold(folded, events)).toBe("Ping");
  });
});
