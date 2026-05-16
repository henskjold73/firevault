#!/usr/bin/env node

import { Command } from "commander";
import { initCommand } from "./commands/init.js";
import { backupCommand } from "./commands/backup.js";
import { commitCommand } from "./commands/commit.js";
import { snapshotCommand } from "./commands/snapshot.js";
import { changesCommand } from "./commands/changes.js";
import { historyCommand } from "./commands/history.js";
import { restorePreviewCommand } from "./commands/restorePreview.js";
import { restoreLocalCommand } from "./commands/restoreLocal.js";
import { restoreFirestoreCommand } from "./commands/restoreFirestore.js";

const program = new Command();

program
  .name("firevault")
  .description("Undo button for Firestore.")
  .version("0.1.0");

program.addCommand(initCommand);
program.addCommand(backupCommand);
program.addCommand(commitCommand);
program.addCommand(snapshotCommand);
program.addCommand(changesCommand);
program.addCommand(historyCommand);
program.addCommand(restorePreviewCommand);
program.addCommand(restoreLocalCommand);
program.addCommand(restoreFirestoreCommand);

program.parse();
