import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { RecommendationsStreamView, appendRecoStreamEvent } from "./RecommendationsStreamView";

describe("appendRecoStreamEvent", () => {
  it("merges consecutive text deltas from the same provider", () => {
    let evs = appendRecoStreamEvent([], { type: "text", providerId: "openai", delta: "a" });
    evs = appendRecoStreamEvent(evs, { type: "text", providerId: "openai", delta: "b" });
    expect(evs).toHaveLength(1);
    expect(evs[0]).toEqual({ type: "text", providerId: "openai", delta: "ab" });
  });

  it("does not merge text across providers", () => {
    let evs = appendRecoStreamEvent([], { type: "text", providerId: "openai", delta: "a" });
    evs = appendRecoStreamEvent(evs, { type: "text", providerId: "anthropic", delta: "b" });
    expect(evs).toHaveLength(2);
  });

  it("merges consecutive thinking deltas", () => {
    let evs = appendRecoStreamEvent([], { type: "thinking", providerId: "cursor-sdk", delta: "x" });
    evs = appendRecoStreamEvent(evs, { type: "thinking", providerId: "cursor-sdk", delta: "y" });
    expect(evs).toHaveLength(1);
    expect(evs[0]).toEqual({ type: "thinking", providerId: "cursor-sdk", delta: "xy" });
  });

  it("replaces consecutive status lines from the same provider", () => {
    let evs = appendRecoStreamEvent([], { type: "status", providerId: "cursor-sdk", message: "A" });
    evs = appendRecoStreamEvent(evs, { type: "status", providerId: "cursor-sdk", message: "B" });
    expect(evs).toHaveLength(1);
    expect(evs[0]).toEqual({ type: "status", providerId: "cursor-sdk", message: "B" });
  });

  it("coalesces multiple toolUse events sharing an id into one entry with merged input", () => {
    let evs = appendRecoStreamEvent([], {
      type: "toolUse",
      providerId: "cursor-sdk",
      name: "shell",
      id: "c1"
    });
    evs = appendRecoStreamEvent(evs, {
      type: "toolUse",
      providerId: "cursor-sdk",
      name: "shell",
      input: { command: "git status" },
      id: "c1"
    });
    expect(evs).toHaveLength(1);
    expect(evs[0]).toMatchObject({
      type: "toolUse",
      name: "shell",
      input: { command: "git status" },
      id: "c1"
    });
  });
});

describe("RecommendationsStreamView", () => {
  it("renders ranking header and streamed text", () => {
    render(
      <RecommendationsStreamView
        streaming
        events={[
          { type: "status", providerId: "recommendations", message: "Contacting…" },
          { type: "text", providerId: "openai", delta: '{"ok":true}' }
        ]}
      />
    );

    expect(screen.getByText(/Ranking/i)).toBeInTheDocument();
    expect(screen.getByText('{"ok":true}')).toBeInTheDocument();
    expect(screen.getByLabelText("LLM ranking progress")).toBeInTheDocument();
  });

  it("shows the actual command for a running tool (no duplicate Running labels)", () => {
    render(
      <RecommendationsStreamView
        streaming
        events={[
          {
            type: "toolUse",
            providerId: "cursor-sdk",
            name: "shell",
            input: { command: "git status" },
            id: "c1"
          }
        ]}
      />
    );

    expect(screen.getAllByText(/git status/).length).toBeGreaterThan(0);
    expect(screen.getByText(/^Running$/)).toBeInTheDocument();
    expect(screen.getByText(/^shell$/)).toBeInTheDocument();
    expect(screen.queryAllByText(/Running…/i)).toHaveLength(0);
  });

  it("past Response rows expand and collapse when truncated", () => {
    const long =
      "The user wants me to rank Cursor agent skills and explain everything in detail. ".repeat(4);
    const scrollSpy = jest.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockImplementation(function (this: HTMLElement) {
      return this.classList.contains("rec-stream-past-text") ? 900 : 50;
    });
    const clientSpy = jest.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function (this: HTMLElement) {
      return this.classList.contains("rec-stream-past-text") ? 80 : 50;
    });
    try {
      render(
        <RecommendationsStreamView
          streaming={false}
          events={[
            { type: "text", providerId: "cursor-sdk", delta: long },
            { type: "thinking", providerId: "cursor-sdk", delta: "more" }
          ]}
        />
      );
      const expandBtn = screen.getByRole("button", { name: /expand response detail/i });
      expect(expandBtn.className).toContain("rec-stream-past-hit");
      fireEvent.click(expandBtn);
      expect(expandBtn.closest("li")).toHaveClass("rec-stream-past-line--expanded");
      fireEvent.click(screen.getByRole("button", { name: /collapse response detail/i }));
      expect(screen.getByRole("button", { name: /expand response detail/i })).toBeInTheDocument();
    } finally {
      scrollSpy.mockRestore();
      clientSpy.mockRestore();
    }
  });
});
