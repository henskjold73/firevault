import { existsSync, readFileSync } from "node:fs";
import { Command } from "commander";
import { ConfigError, loadConfig } from "../config/loadConfig.js";
import {
  GitError,
  assertInsideGitRepository,
  showFileAtCommit,
} from "../git/git.js";
import { normalizeDocumentPath } from "../paths/backupPaths.js";

interface RestorePreviewOptions {
  from?: string;
}

function normalizeJson(content: string): string[] {
  try {
    return JSON.stringify(JSON.parse(content), null, 2).split("\n");
  } catch {
    return content.split("\n");
  }
}

function buildLineDiff(currentContent: string | undefined, restoredContent: string): string[] {
  const currentLines = currentContent ? normalizeJson(currentContent) : [];
  const restoredLines = normalizeJson(restoredContent);
  const lengths = Array.from({ length: currentLines.length + 1 }, () =>
    Array<number>(restoredLines.length + 1).fill(0),
  );
  const lines: string[] = [];

  for (let currentIndex = currentLines.length - 1; currentIndex >= 0; currentIndex -= 1) {
    for (
      let restoredIndex = restoredLines.length - 1;
      restoredIndex >= 0;
      restoredIndex -= 1
    ) {
      if (currentLines[currentIndex] === restoredLines[restoredIndex]) {
        lengths[currentIndex][restoredIndex] =
          lengths[currentIndex + 1][restoredIndex + 1] + 1;
      } else {
        lengths[currentIndex][restoredIndex] = Math.max(
          lengths[currentIndex + 1][restoredIndex],
          lengths[currentIndex][restoredIndex + 1],
        );
      }
    }
  }

  let currentIndex = 0;
  let restoredIndex = 0;

  while (currentIndex < currentLines.length && restoredIndex < restoredLines.length) {
    if (currentLines[currentIndex] === restoredLines[restoredIndex]) {
      lines.push(`  ${currentLines[currentIndex]}`);
      currentIndex += 1;
      restoredIndex += 1;
      continue;
    }

    if (lengths[currentIndex + 1][restoredIndex] >= lengths[currentIndex][restoredIndex + 1]) {
      lines.push(`- ${currentLines[currentIndex]}`);
      currentIndex += 1;
    } else {
      lines.push(`+ ${restoredLines[restoredIndex]}`);
      restoredIndex += 1;
    }
  }

  while (currentIndex < currentLines.length) {
    lines.push(`- ${currentLines[currentIndex]}`);
    currentIndex += 1;
  }

  while (restoredIndex < restoredLines.length) {
    lines.push(`+ ${restoredLines[restoredIndex]}`);
    restoredIndex += 1;
  }

  return lines;
}

export function runRestorePreview(
  inputPath: string,
  options: RestorePreviewOptions,
): void {
  if (!options.from) {
    throw new ConfigError("Missing required option: --from <commit>");
  }

  const config = loadConfig();
  const targetPath = normalizeDocumentPath(inputPath, config.outputDir);

  assertInsideGitRepository();

  const restoredContent = showFileAtCommit(options.from, targetPath);
  const currentExists = existsSync(targetPath);
  const currentContent = currentExists ? readFileSync(targetPath, "utf-8") : undefined;
  const diff = buildLineDiff(currentContent, restoredContent);

  console.log(`Target: ${targetPath}`);
  console.log(`Source commit: ${options.from}`);
  console.log(`Current file exists: ${currentExists ? "yes" : "no"}`);
  console.log("");
  console.log("Diff:");
  console.log("");

  if (diff.length === 0) {
    console.log("No changes.");
    return;
  }

  for (const line of diff) {
    console.log(line);
  }
}

export const restorePreviewCommand = new Command("restore-preview")
  .description("Preview restoring a backed-up document from Git")
  .argument("<path>", "Logical document path or backup file path")
  .requiredOption("--from <commit>", "Git commit to restore from")
  .action((inputPath: string, options: RestorePreviewOptions) => {
    try {
      runRestorePreview(inputPath, options);
    } catch (error) {
      if (error instanceof ConfigError || error instanceof GitError) {
        console.error(error.message);
        process.exitCode = 1;
        return;
      }

      throw error;
    }
  });
