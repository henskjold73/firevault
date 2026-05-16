import { Command } from "commander";
import { loadConfig } from "../config/loadConfig.js";
import { exportCollection } from "../firestore/exportFirestore.js";

export const backupCommand = new Command("backup")
  .description("Back up configured Firestore collections")
  .action(async () => {
    const config = loadConfig();

    for (const collection of config.collections) {
      await exportCollection(config.outputDir, collection);
    }

    console.log("Backup complete.");
  });
