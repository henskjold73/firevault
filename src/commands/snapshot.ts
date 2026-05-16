import { Command } from "commander";
import { ConfigError } from "../config/loadConfig.js";
import { GitError } from "../git/git.js";
import { runBackup } from "./backup.js";
import { runCommit } from "./commit.js";

export async function runSnapshot(
  backup: () => Promise<void> = runBackup,
  commit: () => void = runCommit,
): Promise<void> {
  await backup();
  commit();
}

export const snapshotCommand = new Command("snapshot")
  .description("Back up Firestore and commit backup changes locally")
  .action(async () => {
    try {
      await runSnapshot();
    } catch (error) {
      if (error instanceof ConfigError || error instanceof GitError) {
        console.error(error.message);
        process.exitCode = 1;
        return;
      }

      throw error;
    }
  });
