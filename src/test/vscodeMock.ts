const mockVscode = {
  EventEmitter: class<T> {
    private listeners: Array<(event: T) => void> = [];

    public event = (listener: (event: T) => void) => {
      this.listeners.push(listener);
      return { dispose: jest.fn() };
    };

    public fire = (event: T) => {
      this.listeners.forEach((listener) => listener(event));
    };

    public dispose = jest.fn();
  },
  authentication: {
    getSession: jest.fn()
  },
  workspace: {
    getConfiguration: jest.fn(() => ({
      get: jest.fn(),
      update: jest.fn()
    })),
    workspaceFolders: [{
      uri: {
        fsPath: "/tmp/workspace",
        toString: () => "file:///tmp/workspace"
      }
    }],
    findFiles: jest.fn().mockResolvedValue([]),
    asRelativePath: jest.fn((uri: { fsPath?: string } | string) => {
      if (typeof uri === "string") {
        return uri.replace(/^\/tmp\/workspace\/?/, "").replace(/^\//, "") || ".";
      }
      const p = uri.fsPath ?? "";
      return p.replace(/^\/tmp\/workspace\/?/, "").replace(/\\/g, "/") || ".";
    }),
    fs: {
      createDirectory: jest.fn(),
      writeFile: jest.fn(),
      delete: jest.fn(),
      readDirectory: jest.fn(),
      readFile: jest.fn().mockResolvedValue(new Uint8Array()),
      rename: jest.fn().mockResolvedValue(undefined)
    }
  },
  window: {
    createOutputChannel: jest.fn(() => ({
      appendLine: jest.fn(),
      dispose: jest.fn()
    })),
    showInformationMessage: jest.fn().mockResolvedValue(undefined),
    showWarningMessage: jest.fn().mockResolvedValue(undefined),
    showErrorMessage: jest.fn(),
    showQuickPick: jest.fn(),
    withProgress: jest.fn((_options, task) => task())
  },
  commands: {
    registerCommand: jest.fn(),
    executeCommand: jest.fn(),
    getCommands: jest.fn().mockResolvedValue([])
  },
  CancellationTokenSource: class {
    public token = {
      isCancellationRequested: false,
      onCancellationRequested: jest.fn(() => ({ dispose: jest.fn() }))
    };

    public cancel(): void {
      this.token.isCancellationRequested = true;
    }

    public dispose(): void {
      /* noop */
    }
  },
  env: {
    clipboard: {
      writeText: jest.fn().mockResolvedValue(undefined)
    },
    openExternal: jest.fn().mockResolvedValue(true),
    appName: "Cursor",
    uriScheme: "cursor"
  },
  lm: {
    selectChatModels: jest.fn().mockResolvedValue([])
  },
  LanguageModelChatMessage: {
    User: (text: string) => ({ role: "user", content: text })
  },
  ConfigurationTarget: {
    Workspace: 1
  },
  ProgressLocation: {
    Notification: 1
  },
  FileType: {
    File: 1,
    Directory: 2
  },
  Uri: {
    joinPath: (...parts: Array<{ fsPath?: string } | string>) => ({ fsPath: parts.map((p) => (typeof p === "string" ? p : p.fsPath ?? "")).join("/") }),
    file: (p: string) => ({ fsPath: p }),
    parse: (value: string) => ({ toString: () => value, scheme: value.split(":")[0] ?? "", path: value })
  },
  extensions: {
    all: []
  }
};

export = mockVscode;
