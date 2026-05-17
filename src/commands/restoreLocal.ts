import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Command } from "commander";
import { ConfigError, loadConfig, resolveWorkspacePath } from "../config/loadConfig.js";
import {
  GitError,
  assertInsideGitRepository,
  showFileAtCommit,
} from "../git/git.js";
import { normalizeDocumentPath } from "../paths/backupPaths.js";
import { buildLineDiff, printRestorePreview } from "./restorePreview.js";

interface RestoreLocalOptions {
  from?: string;
  confirm?: boolean;
}

export function runRestoreLocal(
  inputPath: string,
  options: RestoreLocalOptions,
): void {
  if (!options.from) {
    throw new ConfigError("Missing required option: --from <commit>");
  }

  if (!options.confirm) {
    throw new ConfigError(
      "Missing required option: --confirm. Run restore-preview first, then rerun with --confirm to write the local backup file.",
    );
  }

  const config = loadConfig();
  const targetPath = normalizeDocumentPath(inputPath, config.outputDir);

  assertInsideGitRepository(config.workspaceRoot);

  const restoredContent = showFileAtCommit(options.from, targetPath, config.workspaceRoot);
  const targetFilePath = resolveWorkspacePath(config.workspaceRoot, targetPath);
  const currentExists = existsSync(targetFilePath);
  const currentContent = currentExists ? readFileSync(targetFilePath, "utf-8") : undefined;
  const diff = buildLineDiff(currentContent, restoredContent);

  printRestorePreview(targetPath, options.from, currentExists, diff);

  mkdirSync(path.dirname(targetFilePath), { recursive: true });
  writeFileSync(targetFilePath, restoredContent);

  console.log("");
  console.log(`Restored local backup file: ${targetPath}`);
}

export const restoreLocalCommand = new Command("restore-local")
  .description("Restore a backed-up document from Git into the local backup directory")
  .argument("<path>", "Logical document path or backup file path")
  .option("--from <commit>", "Git commit to restore from")
  .option("--confirm", "Confirm writing the local backup file")
  .action((inputPath: string, options: RestoreLocalOptions) => {
    try {
      runRestoreLocal(inputPath, options);
    } catch (error) {
      if (error instanceof ConfigError || error instanceof GitError) {
        console.error(error.message);
        process.exitCode = 1;
        return;
      }

      throw error;
    }
  });
