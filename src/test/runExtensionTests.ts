import * as path from "path";
import { runTests } from "@vscode/test-electron";

async function main(): Promise<void> {
  try {
    const extensionDevelopmentPath = path.resolve(__dirname, "../../../");
    const extensionTestsPath = path.resolve(__dirname, "./suite/index");

    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [path.resolve(__dirname, "../../")]
    });
  } catch (error) {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    process.stderr.write(`Failed to run extension tests\n${message}\n`);
    process.exit(1);
  }
}

void main();
