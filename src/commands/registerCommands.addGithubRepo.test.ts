import * as vscode from "vscode";
import { addGithubRepoCommand } from "./registerCommands";
import { AuthService } from "../services/AuthService";
import { ConfigService } from "../services/ConfigService";
import { RepoService } from "../services/RepoService";
import { SyncEngine } from "../services/SyncEngine";
import { Logger } from "../utils/logger";
import { ServiceError } from "../services/ServiceError";
import { SyncResult } from "../types";

const mockWindow = vscode.window as unknown as {
  showInputBox: jest.Mock;
  showInformationMessage: jest.Mock;
  showWarningMessage: jest.Mock;
  showErrorMessage: jest.Mock;
};
const mockEnv = vscode.env as unknown as { clipboard: { readText: jest.Mock } };
const mockCommands = vscode.commands as unknown as { executeCommand: jest.Mock };

function successSync(): SyncResult {
  return {
    status: "success",
    reason: "none",
    message: "ok",
    timestamp: "",
    updated: [],
    deleted: [],
    errors: [],
    staleSources: []
  };
}

describe("addGithubRepoCommand", () => {
  const logger: Pick<Logger, "log" | "error" | "warn" | "show" | "dispose"> = {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    show: jest.fn(),
    dispose: jest.fn()
  };

  let configService: { getSources: jest.Mock; addSource: jest.Mock };
  let repoService: { getRepoInfo: jest.Mock };
  let syncEngine: { sync: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    mockEnv.clipboard.readText.mockResolvedValue("");
    mockWindow.showWarningMessage.mockResolvedValue(undefined);
    mockWindow.showInformationMessage.mockResolvedValue(undefined);
    mockCommands.executeCommand.mockResolvedValue(undefined);

    configService = {
      getSources: jest.fn().mockReturnValue([]),
      addSource: jest.fn().mockResolvedValue(undefined)
    };
    repoService = {
      getRepoInfo: jest.fn().mockImplementation(async (owner: string, repo: string) => ({
        id: 1,
        fullName: `${owner}/${repo}`,
        description: "",
        private: false
      }))
    };
    syncEngine = {
      sync: jest.fn().mockResolvedValue(successSync())
    };
  });

  it("pre-fills input from clipboard when it parses as a repo spec", async () => {
    mockEnv.clipboard.readText.mockResolvedValue("https://github.com/a/b");
    mockWindow.showInputBox.mockResolvedValue(undefined);

    await addGithubRepoCommand(
      {} as AuthService,
      configService as unknown as ConfigService,
      repoService as unknown as RepoService,
      syncEngine as unknown as SyncEngine,
      logger as unknown as Logger
    );

    expect(mockWindow.showInputBox).toHaveBeenCalledWith(
      expect.objectContaining({ value: "a/b" })
    );
    expect(configService.addSource).not.toHaveBeenCalled();
  });

  it("skips add when the repo is already configured", async () => {
    configService.getSources.mockReturnValue([{ type: "github-repo", value: "Owner/Repo" }]);
    mockWindow.showInputBox.mockResolvedValue("owner/repo");

    await addGithubRepoCommand(
      {} as AuthService,
      configService as unknown as ConfigService,
      repoService as unknown as RepoService,
      syncEngine as unknown as SyncEngine,
      logger as unknown as Logger
    );

    expect(mockWindow.showInformationMessage).toHaveBeenCalledWith(
      "GitHub source owner/repo is already configured."
    );
    expect(repoService.getRepoInfo).not.toHaveBeenCalled();
    expect(configService.addSource).not.toHaveBeenCalled();
  });

  it("adds source and syncs after verification", async () => {
    mockWindow.showInputBox.mockResolvedValueOnce("my/gh").mockResolvedValueOnce(undefined);

    await addGithubRepoCommand(
      {} as AuthService,
      configService as unknown as ConfigService,
      repoService as unknown as RepoService,
      syncEngine as unknown as SyncEngine,
      logger as unknown as Logger
    );

    expect(repoService.getRepoInfo).toHaveBeenCalledWith("my", "gh");
    expect(configService.addSource).toHaveBeenCalledWith({ type: "github-repo", value: "my/gh" });
    expect(syncEngine.sync).toHaveBeenCalledWith(true);
  });

  it("prompts to sign in once on no_session then retries verification", async () => {
    repoService.getRepoInfo
      .mockRejectedValueOnce(new ServiceError("no_session", "No GitHub session is available."))
      .mockResolvedValueOnce({
        id: 2,
        fullName: "Org/The-Repo",
        description: "",
        private: false
      });
    mockWindow.showWarningMessage.mockResolvedValue("Sign In");
    mockWindow.showInputBox.mockResolvedValueOnce("org/the-repo").mockResolvedValueOnce(undefined);

    await addGithubRepoCommand(
      {} as AuthService,
      configService as unknown as ConfigService,
      repoService as unknown as RepoService,
      syncEngine as unknown as SyncEngine,
      logger as unknown as Logger
    );

    expect(mockWindow.showWarningMessage).toHaveBeenCalledWith(
      "GitHub sign-in is required to verify and add a repository.",
      "Sign In"
    );
    expect(mockCommands.executeCommand).toHaveBeenCalledWith("skillSync.signIn");
    expect(repoService.getRepoInfo).toHaveBeenCalledTimes(2);
    expect(configService.addSource).toHaveBeenCalledWith({
      type: "github-repo",
      value: "Org/The-Repo"
    });
  });

  it("does not retry sign-in when the user dismisses the warning", async () => {
    repoService.getRepoInfo.mockRejectedValueOnce(new ServiceError("no_session", "No session."));
    mockWindow.showInputBox.mockResolvedValueOnce("x/y");

    await addGithubRepoCommand(
      {} as AuthService,
      configService as unknown as ConfigService,
      repoService as unknown as RepoService,
      syncEngine as unknown as SyncEngine,
      logger as unknown as Logger
    );

    expect(mockCommands.executeCommand).not.toHaveBeenCalled();
    expect(configService.addSource).not.toHaveBeenCalled();
  });
});
