import { Command } from "commander";
import { ConfigError, loadConfig } from "../config/loadConfig.js";
import {
  FileChanges,
  GitError,
  assertInsideGitRepository,
  getHistoricalChanges,
  getWorkingTreeChanges,
} from "../git/git.js";

function printSection(title: string, paths: string[]): void {
  console.log(`${title}:`);
  console.log("");

  for (const path of paths) {
    console.log(`* ${path}`);
  }

  console.log("");
}

function printChanges(changes: FileChanges): void {
  printSection("Added", changes.added);
  printSection("Modified", changes.modified);
  printSection("Deleted", changes.deleted);
}

function normalizeLastWindow(last: string): string {
  const match = last.match(/^(\d+)([hdw])$/);

  if (!match) {
    return last;
  }

  const amount = match[1];
  const unit = match[2];

  if (unit === "h") {
    return `${amount} hours ago`;
  }

  if (unit === "d") {
    return `${amount} days ago`;
  }

  return `${amount} weeks ago`;
}

export function runChanges(last?: string): void {
  const config = loadConfig();

  assertInsideGitRepository(config.workspaceRoot);

  const changes = last
    ? getHistoricalChanges(config.outputDir, normalizeLastWindow(last), config.workspaceRoot)
    : getWorkingTreeChanges(config.outputDir, config.workspaceRoot);

  printChanges(changes);
}

export const changesCommand = new Command("changes")
  .description("Show file-level Git changes under the configured backup directory")
  .option("--last <window>", "Show committed changes since a time window, such as 24h")
  .action((options: { last?: string }) => {
    try {
      runChanges(options.last);
    } catch (error) {
      if (error instanceof ConfigError || error instanceof GitError) {
        console.error(error.message);
        process.exitCode = 1;
        return;
      }

      throw error;
    }
  });
