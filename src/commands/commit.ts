import { Command } from "commander";
import { ConfigError, loadConfig } from "../config/loadConfig.js";
import {
  GitError,
  assertInsideGitRepository,
  commitPath,
  hasChangesUnder,
  stagePath,
} from "../git/git.js";

export function runCommit(): void {
  const config = loadConfig();

  assertInsideGitRepository();

  if (!hasChangesUnder(config.outputDir)) {
    console.log(`No changes found under ${config.outputDir}.`);
    return;
  }

  stagePath(config.outputDir);

  const message = `backup: ${new Date().toISOString()}`;
  commitPath(message, config.outputDir);

  console.log(`Created commit: ${message}`);
}

export const commitCommand = new Command("commit")
  .description("Commit changes under the configured Firestore backup directory")
  .action(() => {
    try {
      runCommit();
    } catch (error) {
      if (error instanceof ConfigError || error instanceof GitError) {
        console.error(error.message);
        process.exitCode = 1;
        return;
      }

      throw error;
    }
  });
