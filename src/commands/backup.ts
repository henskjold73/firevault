import { Command } from "commander";
import { ConfigError, loadConfig } from "../config/loadConfig.js";
import { exportCollection } from "../firestore/exportFirestore.js";

export async function runBackup(): Promise<void> {
  const config = loadConfig();

  for (const collection of config.collections) {
    await exportCollection(config.outputDirPath, collection);
  }

  console.log("Backup complete.");
}

export const backupCommand = new Command("backup")
  .description("Back up configured Firestore collections")
  .action(async () => {
    try {
      await runBackup();
    } catch (error) {
      if (error instanceof ConfigError) {
        console.error(error.message);
        process.exitCode = 1;
        return;
      }

      throw error;
    }
  });
