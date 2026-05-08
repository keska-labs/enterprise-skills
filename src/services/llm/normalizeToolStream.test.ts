import { normalizeToolBlockForStream } from "./normalizeToolStream";

describe("normalizeToolBlockForStream", () => {
  it("parses string arguments JSON into input", () => {
    const out = normalizeToolBlockForStream({
      type: "function",
      id: "call_1",
      function: {
        name: "shell",
        arguments: JSON.stringify({ command: "npm ci", cwd: "/tmp" })
      }
    });
    expect(out.name).toBe("shell");
    expect(out.input).toEqual({ command: "npm ci", cwd: "/tmp" });
    expect(out.id).toBe("call_1");
  });

  it("wraps non-JSON arguments string as command", () => {
    const out = normalizeToolBlockForStream({
      type: "tool_use",
      name: "shell",
      arguments: "  git status  "
    });
    expect(out.input).toEqual({ command: "git status" });
  });

  it("keeps explicit input object", () => {
    const out = normalizeToolBlockForStream({
      type: "tool_use",
      name: "read_file",
      input: { path: "src/a.ts" }
    });
    expect(out.input).toEqual({ path: "src/a.ts" });
  });

  it("parses JSON string in input field", () => {
    const out = normalizeToolBlockForStream({
      type: "tool_use",
      name: "shell",
      input: '{"command":"ls -la"}'
    });
    expect(out.input).toEqual({ command: "ls -la" });
  });
});
