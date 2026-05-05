import * as vscode from "vscode";
import { ConfigService } from "../services/ConfigService";
import { SyncEngine } from "../services/SyncEngine";
import { maybeShowConfigurePrompt, WELCOME_PROMPT_WORKSPACE_KEY } from "../utils/welcomePrompt";

describe("maybeShowConfigurePrompt", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("does not show when welcome was already shown for this workspace", async () => {
    const workspaceState = {
      get: jest.fn().mockReturnValue(true),
      update: jest.fn()
    };
    const context = { workspaceState } as unknown as vscode.ExtensionContext;
    const configService = { isSourceConfigured: jest.fn() } as unknown as ConfigService;
    const syncEngine = { sync: jest.fn() } as unknown as SyncEngine;

    await maybeShowConfigurePrompt(context, configService, syncEngine);

    expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
    expect(workspaceState.update).not.toHaveBeenCalled();
  });

  it("marks workspace state and shows the prompt on first open", async () => {
    const workspaceState = {
      get: jest.fn().mockReturnValue(false),
      update: jest.fn().mockResolvedValue(undefined)
    };
    const context = { workspaceState } as unknown as vscode.ExtensionContext;
    const configService = { isSourceConfigured: jest.fn() } as unknown as ConfigService;
    const syncEngine = { sync: jest.fn() } as unknown as SyncEngine;
    (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue(undefined);

    await maybeShowConfigurePrompt(context, configService, syncEngine);

    expect(workspaceState.update).toHaveBeenCalledWith(WELCOME_PROMPT_WORKSPACE_KEY, true);
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining("Curate AI skills"),
      "Configure Skills",
      "Not Now"
    );
  });

  it("invokes configure command and sync when user chooses Configure Skills", async () => {
    const workspaceState = {
      get: jest.fn().mockReturnValue(false),
      update: jest.fn().mockResolvedValue(undefined)
    };
    const context = { workspaceState } as unknown as vscode.ExtensionContext;
    const configService = {
      isSourceConfigured: jest.fn().mockReturnValue(true)
    } as unknown as ConfigService;
    const syncEngine = { sync: jest.fn().mockResolvedValue(undefined) } as unknown as SyncEngine;
    (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue("Configure Skills");
    (vscode.commands.executeCommand as jest.Mock).mockResolvedValue(undefined);

    await maybeShowConfigurePrompt(context, configService, syncEngine);

    expect(vscode.commands.executeCommand).toHaveBeenCalledWith("skillSync.configureSource");
    expect(syncEngine.sync).toHaveBeenCalledWith(true);
  });

  it("does not sync after configure if source is still unconfigured", async () => {
    const workspaceState = {
      get: jest.fn().mockReturnValue(false),
      update: jest.fn().mockResolvedValue(undefined)
    };
    const context = { workspaceState } as unknown as vscode.ExtensionContext;
    const configService = {
      isSourceConfigured: jest.fn().mockReturnValue(false)
    } as unknown as ConfigService;
    const syncEngine = { sync: jest.fn() } as unknown as SyncEngine;
    (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue("Configure Skills");
    (vscode.commands.executeCommand as jest.Mock).mockResolvedValue(undefined);

    await maybeShowConfigurePrompt(context, configService, syncEngine);

    expect(vscode.commands.executeCommand).toHaveBeenCalledWith("skillSync.configureSource");
    expect(syncEngine.sync).not.toHaveBeenCalled();
  });
});
