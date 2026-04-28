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

  it("reads GA4 allow-without-telemetry default false", () => {
    mockGet.mockReturnValue(false);
    const service = new ConfigService();
    expect(service.getGa4AllowWithoutProductTelemetry()).toBe(false);
    expect(mockGet).toHaveBeenCalledWith("ga4AllowWithoutProductTelemetry", false);
  });

  it("reads GA4 allow-without-telemetry true", () => {
    mockGet.mockImplementation((key: string, defaultValue: unknown) => {
      if (key === "ga4AllowWithoutProductTelemetry") {
        return true;
      }
      return defaultValue;
    });
    const service = new ConfigService();
    expect(service.getGa4AllowWithoutProductTelemetry()).toBe(true);
  });
});
