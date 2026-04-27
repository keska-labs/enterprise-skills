import React from "react";
import { render } from "@testing-library/react";
import { App } from "./App";
import { act } from "react";
import { SkillManagerState } from "./types/messages";

const postMessage = jest.fn();

jest.mock("./hooks/useVsCodeApi", () => ({
  useVsCodeApi: () => ({
    postMessage,
    setState: jest.fn(),
    getState: jest.fn()
  })
}));

function skillManagerPayload(overrides: Partial<SkillManagerState>): SkillManagerState {
  return {
    isConnected: false,
    connectionHealth: "unknown",
    categories: [],
    enabledCategories: [],
    optedInSkills: [],
    lastSyncTime: null,
    sourceRepository: "",
    sourceMode: "github-repo",
    syncStatus: "idle",
    lastError: null,
    syncMessage: null,
    catalogStatus: "idle",
    catalogError: null,
    skillsRootPath: null,
    browseEntries: [],
    catalogSize: 0,
    ...overrides
  };
}

describe("App", () => {
  beforeEach(() => {
    postMessage.mockReset();
  });

  it("requests state on load", () => {
    render(<App />);
    expect(postMessage).toHaveBeenCalledWith({ type: "ready" });
  });

  it("renders loading state initially", () => {
    const view = render(<App />);
    expect(view.getByText("Skill Manager")).toBeInTheDocument();
    expect(view.getByText("Preparing your workspace…")).toBeInTheDocument();
  });

  it("renders empty state after setState with no connection", () => {
    const view = render(<App />);
    act(() => {
      window.dispatchEvent(new MessageEvent("message", {
        data: {
          type: "setState",
          payload: skillManagerPayload({
            isConnected: false,
            connectionHealth: "unknown"
          })
        }
      }));
    });
    expect(view.getByRole("heading", { name: "Connect a skill source" })).toBeInTheDocument();
  });

  it("keeps success sync completion quiet in the connected view", async () => {
    const view = render(<App />);
    act(() => {
      window.dispatchEvent(new MessageEvent("message", {
        data: {
          type: "setState",
          payload: skillManagerPayload({
            isConnected: true,
            connectionHealth: "ok",
            categories: [],
            enabledCategories: [],
            optedInSkills: [],
            lastSyncTime: null,
            sourceRepository: "org/repo",
            sourceMode: "github-repo",
            syncStatus: "idle",
            lastError: null,
            syncMessage: null
          })
        }
      }));
    });
    act(() => {
      window.dispatchEvent(new MessageEvent("message", {
        data: {
          type: "syncComplete",
          payload: {
            status: "success",
            reason: "none",
            message: "Skills synced successfully.",
            timestamp: new Date().toISOString(),
            updated: ["a"],
            deleted: [],
            errors: []
          }
        }
      }));
    });
    expect(await view.findByText("org/repo")).toBeInTheDocument();
    expect(view.queryByText(/Skills synced successfully/)).not.toBeInTheDocument();
  });
});
