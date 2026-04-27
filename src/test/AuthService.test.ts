import { AuthService } from "../services/AuthService";
import * as vscode from "vscode";

const getSession = vscode.authentication.getSession as jest.Mock;

describe("AuthService", () => {
  beforeEach(() => {
    getSession.mockReset();
  });

  it("returns token when session exists", async () => {
    getSession.mockResolvedValue({ accessToken: "token-123" });
    const service = new AuthService();
    await expect(service.getToken(false)).resolves.toBe("token-123");
  });
});
