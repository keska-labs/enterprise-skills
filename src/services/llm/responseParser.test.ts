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
});
