import * as vscode from "vscode";
import { ServiceError } from "./ServiceError";

export class AuthService {
  public async getSession(forcePrompt: boolean): Promise<vscode.AuthenticationSession | undefined> {
    return vscode.authentication.getSession(
      "github",
      ["read:org", "repo"],
      { createIfNone: forcePrompt }
    );
  }

  public async getToken(forcePrompt: boolean): Promise<string | undefined> {
    try {
      const session = await this.getSession(forcePrompt);
      return session?.accessToken;
    } catch (error) {
      throw new ServiceError(
        "auth_expired",
        `Unable to retrieve GitHub session: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}
