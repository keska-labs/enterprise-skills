import { parseLlmRankResponse } from "./responseParser";

describe("parseLlmRankResponse", () => {
  const names = new Set(["alpha", "beta"]);

  it("parses minimal valid JSON", () => {
    const raw = JSON.stringify({
      recommendations: [
        { name: "alpha", score: 80, reason: "Because", matchKind: "strong" },
        { name: "beta", score: 40, reason: "Maybe", matchKind: "weak" }
      ]
    });
    const out = parseLlmRankResponse(raw, names);
    expect(out?.recommendations).toHaveLength(2);
    expect(out?.recommendations[0].score).toBe(80);
  });

  it("strips markdown fences", () => {
    const inner = JSON.stringify({
      recommendations: [{ name: "alpha", score: 50, reason: "Ok", matchKind: "general" }]
    });
    const raw = "```json\n" + inner + "\n```";
    expect(parseLlmRankResponse(raw, names)?.recommendations).toHaveLength(1);
  });

  it("drops unknown skill names", () => {
    const raw = JSON.stringify({
      recommendations: [{ name: "nope", score: 99, reason: "x", matchKind: "strong" }]
    });
    expect(parseLlmRankResponse(raw, names)).toBeUndefined();
  });

  it("returns undefined for malformed JSON", () => {
    expect(parseLlmRankResponse("not json", names)).toBeUndefined();
  });

  it("clamps score to 0-100", () => {
    const raw = JSON.stringify({
      recommendations: [{ name: "alpha", score: 999, reason: "x", matchKind: "strong" }]
    });
    expect(parseLlmRankResponse(raw, names)?.recommendations[0].score).toBe(100);
  });

  it("accepts discovery rows with installSource even when name is not in catalog", () => {
    const raw = JSON.stringify({
      recommendations: [
        {
          name: "custom-from-readme",
          score: 70,
          reason: "Listed in README",
          matchKind: "strong",
          installSource: { value: "anthropics/skills", skillPath: "skills/docx" },
          discoverySourceKey: "official-skills:directory"
        }
      ]
    });
    const out = parseLlmRankResponse(raw, new Set());
    expect(out?.recommendations).toHaveLength(1);
    expect(out?.recommendations[0].installSource?.value).toBe("anthropics/skills");
    expect(out?.recommendations[0].discoverySourceKey).toBe("official-skills:directory");
  });

  it("rejects invalid installSource owner/repo", () => {
    const raw = JSON.stringify({
      recommendations: [
        {
          name: "x",
          score: 70,
          reason: "bad",
          matchKind: "strong",
          installSource: { value: "not-a-repo-ref" }
        }
      ]
    });
    expect(parseLlmRankResponse(raw, new Set())).toBeUndefined();
  });
});
