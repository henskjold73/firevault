#!/usr/bin/env node

import { Command } from "commander";
import { initCommand } from "./commands/init.js";
import { backupCommand } from "./commands/backup.js";

const program = new Command();

program
  .name("firevault")
  .description("Git-native backup, diff, and recovery tooling for Firestore.")
  .version("0.1.0");

program.addCommand(initCommand);
program.addCommand(backupCommand);

program.parse();
