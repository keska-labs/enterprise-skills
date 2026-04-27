import * as assert from "assert";
import * as vscode from "vscode";

suite("Agent Skill Sync Extension", () => {
  test("extension activates", async () => {
    const extension = vscode.extensions.getExtension("open-source.agent-skill-sync");
    assert.ok(extension, "Extension should be discoverable by VS Code.");

    await extension?.activate();
    assert.strictEqual(extension?.isActive, true);
  });

  test("commands are registered", async () => {
    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes("skillSync.manageSkills"));
    assert.ok(commands.includes("skillSync.configureSource"));
    assert.ok(commands.includes("skillSync.syncNow"));
  });
});
