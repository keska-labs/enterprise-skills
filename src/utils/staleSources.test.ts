import { formatStaleSources } from "./staleSources";

describe("formatStaleSources", () => {
  it("formats a single source with retry time", () => {
    const retry = new Date("2030-01-01T12:00:00Z").toISOString();
    const out = formatStaleSources([{ label: "owner/repo", reason: "rate_limited", retryAt: retry }]);
    expect(out).toMatch(/^owner\/repo \(GitHub rate limit, retry at /);
  });

  it("lists 2-3 sources comma-separated", () => {
    const out = formatStaleSources([
      { label: "a", reason: "rate_limited" },
      { label: "b", reason: "rate_limited" }
    ]);
    expect(out).toContain("a, b");
    expect(out).toContain("GitHub rate limit");
  });

  it("summarizes when more than 3 sources are stale", () => {
    const out = formatStaleSources([
      { label: "a", reason: "rate_limited" },
      { label: "b", reason: "rate_limited" },
      { label: "c", reason: "rate_limited" },
      { label: "d", reason: "rate_limited" }
    ]);
    expect(out).toMatch(/^4 sources \(/);
  });

  it("uses upstream-unreachable wording when reasons mix", () => {
    const out = formatStaleSources([
      { label: "a", reason: "rate_limited" },
      { label: "b", reason: "network" }
    ]);
    expect(out).toContain("upstream unreachable");
  });

  it("returns empty string when given no entries", () => {
    expect(formatStaleSources([])).toBe("");
  });
});
