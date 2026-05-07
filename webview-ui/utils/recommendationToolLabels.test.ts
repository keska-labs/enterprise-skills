import { extractPrimaryToolDetail, formatToolUseHeadline } from "./recommendationToolLabels";

describe("formatToolUseHeadline", () => {
  it("shows shell command when present in object input", () => {
    expect(formatToolUseHeadline("shell", { command: "npm test" })).toBe("shell — npm test");
  });

  it("falls back to tool name when no recognizable detail", () => {
    expect(formatToolUseHeadline("shell", {})).toBe("shell");
  });

  it("extracts path for read-like tools", () => {
    expect(formatToolUseHeadline("read_file", { path: "foo/bar.ts" })).toBe("read_file — foo/bar.ts");
  });
});

describe("extractPrimaryToolDetail", () => {
  it("reads string input as command body", () => {
    expect(extractPrimaryToolDetail("shell", "echo hello")).toBe("echo hello");
  });
});
