import * as vscode from "vscode";

export class Logger {
  private readonly channel: vscode.OutputChannel;

  public constructor(name: string) {
    this.channel = vscode.window.createOutputChannel(name);
  }

  public log(message: string): void {
    this.channel.appendLine(`[INFO] ${message}`);
  }

  public warn(message: string): void {
    this.channel.appendLine(`[WARN] ${message}`);
  }

  public error(message: string, error?: unknown): void {
    const errorText = error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error ?? "");
    this.channel.appendLine(`[ERROR] ${message}${errorText ? ` | ${errorText}` : ""}`);
  }

  public show(preserveFocus = true): void {
    this.channel.show(preserveFocus);
  }

  public dispose(): void {
    this.channel.dispose();
  }
}
