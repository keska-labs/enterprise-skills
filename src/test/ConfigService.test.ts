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
});
