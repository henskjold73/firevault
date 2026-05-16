#!/usr/bin/env node

import { Command } from "commander";
import { initCommand } from "./commands/init.js";
import { backupCommand } from "./commands/backup.js";
import { commitCommand } from "./commands/commit.js";
import { snapshotCommand } from "./commands/snapshot.js";
import { changesCommand } from "./commands/changes.js";
import { historyCommand } from "./commands/history.js";
import { restorePreviewCommand } from "./commands/restorePreview.js";

const program = new Command();

program
  .name("firevault")
  .description("Git-native backup, diff, and recovery tooling for Firestore.")
  .version("0.1.0");

program.addCommand(initCommand);
program.addCommand(backupCommand);
program.addCommand(commitCommand);
program.addCommand(snapshotCommand);
program.addCommand(changesCommand);
program.addCommand(historyCommand);
program.addCommand(restorePreviewCommand);

program.parse();
