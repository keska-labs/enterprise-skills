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
      uri: { fsPath: "/tmp/workspace" }
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
      readFile: jest.fn().mockResolvedValue(new Uint8Array())
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
    executeCommand: jest.fn()
  },
  ConfigurationTarget: {
    Workspace: 1
  },
  ProgressLocation: {
    Notification: 1
  },
  FileType: {
    File: 1
  },
  Uri: {
    joinPath: (...parts: Array<{ fsPath?: string } | string>) => ({ fsPath: parts.map((p) => (typeof p === "string" ? p : p.fsPath ?? "")).join("/") }),
    file: (p: string) => ({ fsPath: p })
  },
  extensions: {
    all: []
  }
};

export = mockVscode;
