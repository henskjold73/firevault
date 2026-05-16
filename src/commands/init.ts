import { Command } from "commander";
import { writeFileSync, existsSync } from "node:fs";

const defaultConfig = {
  projectId: "your-firebase-project-id",
  serviceAccountPath: "./serviceAccountKey.json",
  outputDir: "firestore-backups",
  collections: [],
};

export const initCommand = new Command("init")
  .description("Create a firevault.config.json file")
  .action(() => {
    const configPath = "firevault.config.json";

    if (existsSync(configPath)) {
      console.log("firevault.config.json already exists.");
      return;
    }

    writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));

    console.log("Created firevault.config.json");
  });
