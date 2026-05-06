import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { Header } from "./Header";
import { SkillSourceState } from "../types/messages";

function setup(overrides: Partial<React.ComponentProps<typeof Header>> = {}) {
  const onAddSource = jest.fn();
  const onRemoveSource = jest.fn();
  const onSyncNow = jest.fn();
  const onSearchChange = jest.fn();
  render(
    <Header
      searchQuery=""
      onSearchChange={onSearchChange}
      sources={[]}
      lastSynced={null}
      isSyncing={false}
      optedInCount={0}
      totalCount={0}
      onAddSource={onAddSource}
      onRemoveSource={onRemoveSource}
      onSyncNow={onSyncNow}
      {...overrides}
    />
  );
  return { onAddSource, onRemoveSource, onSyncNow, onSearchChange };
}

describe("Header", () => {
  it("renders each configured source as a chip with a remove button", () => {
    const sources: SkillSourceState[] = [
      { type: "github-repo", value: "owner/a", label: "a", sourceKey: "github:owner/a" },
      { type: "custom-registry", value: "https://reg.example", label: "reg-example", sourceKey: "registry:https://reg.example" }
    ];
    const { onRemoveSource } = setup({ sources });
    expect(screen.getByText("a")).toBeInTheDocument();
    expect(screen.getByText("reg-example")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Remove source a/i }));
    expect(onRemoveSource).toHaveBeenCalledWith("github:owner/a");
  });

  it("invokes onAddSource when the add button is clicked", () => {
    const { onAddSource } = setup();
    fireEvent.click(screen.getByRole("button", { name: /Add skill source/i }));
    expect(onAddSource).toHaveBeenCalled();
  });

  it("renders an em-dash when no sources are configured", () => {
    setup();
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
