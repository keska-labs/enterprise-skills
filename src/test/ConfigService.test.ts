import { ConfigService } from "../services/ConfigService";
import * as vscode from "vscode";

const getConfiguration = vscode.workspace.getConfiguration as jest.Mock;
const mockUpdate = jest.fn();
const mockGet = jest.fn();

describe("ConfigService", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockUpdate.mockReset();
    getConfiguration.mockReturnValue({
      get: mockGet,
      update: mockUpdate
    });
  });

  it("reads source mode default", () => {
    mockGet.mockReturnValue("github-repo");
    const service = new ConfigService();
    expect(service.getSourceMode()).toBe("github-repo");
  });

  it("writes source repository", async () => {
    const service = new ConfigService();
    await service.setSourceRepository("foo/bar");
    expect(mockUpdate).toHaveBeenCalled();
  });

  it("isSourceConfigured is true for github-repo when repository is set", () => {
    mockGet.mockImplementation((key: string) => {
      if (key === "sourceMode") {
        return "github-repo";
      }
      if (key === "sourceRepository") {
        return "org/skills";
      }
      return "";
    });
    const service = new ConfigService();
    expect(service.isSourceConfigured()).toBe(true);
  });

  it("isSourceConfigured is false for github-repo when repository is empty", () => {
    mockGet.mockImplementation((key: string) => {
      if (key === "sourceMode") {
        return "github-repo";
      }
      if (key === "sourceRepository") {
        return "  ";
      }
      return "";
    });
    const service = new ConfigService();
    expect(service.isSourceConfigured()).toBe(false);
  });

  it("isSourceConfigured is true for custom-registry when registry URL is set", () => {
    mockGet.mockImplementation((key: string) => {
      if (key === "sourceMode") {
        return "custom-registry";
      }
      if (key === "registryUrl") {
        return "https://registry.example/skills";
      }
      return "";
    });
    const service = new ConfigService();
    expect(service.isSourceConfigured()).toBe(true);
  });

  it("isSourceConfigured is false for custom-registry when registry URL is empty", () => {
    mockGet.mockImplementation((key: string) => {
      if (key === "sourceMode") {
        return "custom-registry";
      }
      if (key === "registryUrl") {
        return "";
      }
      return "";
    });
    const service = new ConfigService();
    expect(service.isSourceConfigured()).toBe(false);
  });
});
