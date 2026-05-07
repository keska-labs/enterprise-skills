import { parseRepoSpec } from "./repoSpec";

describe("parseRepoSpec", () => {
  it("parses owner/repo", () => {
    expect(parseRepoSpec("foo/bar")).toEqual({ owner: "foo", repo: "bar" });
    expect(parseRepoSpec("  Foo/BAR  ")).toEqual({ owner: "Foo", repo: "BAR" });
  });

  it("parses https github URLs", () => {
    expect(parseRepoSpec("https://github.com/octocat/Hello-World")).toEqual({
      owner: "octocat",
      repo: "Hello-World"
    });
    expect(parseRepoSpec("https://github.com/o/r.git")).toEqual({ owner: "o", repo: "r" });
    expect(parseRepoSpec("http://github.com/o/r/issues/1")).toEqual({ owner: "o", repo: "r" });
  });

  it("parses ssh refs", () => {
    expect(parseRepoSpec("git@github.com:o/r.git")).toEqual({ owner: "o", repo: "r" });
  });

  it("returns null for invalid input", () => {
    expect(parseRepoSpec("")).toBeNull();
    expect(parseRepoSpec("   ")).toBeNull();
    expect(parseRepoSpec("nonsense")).toBeNull();
    expect(parseRepoSpec("onlyowner")).toBeNull();
  });
});
