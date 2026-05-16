import { Command } from "commander";
import { ConfigError, loadConfig } from "../config/loadConfig.js";
import {
  GitError,
  HistoryEntry,
  assertInsideGitRepository,
  getHistory,
} from "../git/git.js";
import { normalizeHistoryPath } from "../paths/backupPaths.js";

function printHistory(entries: HistoryEntry[]): void {
  for (const entry of entries) {
    const parts = [entry.shortSha, entry.date, entry.message];

    if (entry.changedFileCount !== undefined) {
      const label = entry.changedFileCount === 1 ? "file" : "files";
      parts.push(`${entry.changedFileCount} ${label}`);
    }

    console.log(parts.join("  "));
  }
}

export function runHistory(inputPath: string): void {
  const config = loadConfig();
  const normalizedPath = normalizeHistoryPath(inputPath, config.outputDir);

  assertInsideGitRepository();

  const entries = getHistory(normalizedPath.path, normalizedPath.isCollection);

  if (entries.length === 0) {
    console.log(`No history found for ${normalizedPath.path}.`);
    return;
  }

  printHistory(entries);
}

export const historyCommand = new Command("history")
  .description("Show Git history for a backed-up document or collection")
  .argument("<path>", "Logical path or backup file path")
  .action((inputPath: string) => {
    try {
      runHistory(inputPath);
    } catch (error) {
      if (error instanceof ConfigError || error instanceof GitError) {
        console.error(error.message);
        process.exitCode = 1;
        return;
      }

      throw error;
    }
  });
