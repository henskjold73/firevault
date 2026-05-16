import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { Command } from "commander";
import { ConfigError, loadConfig } from "../config/loadConfig.js";
import { FirestoreError, writeDocument } from "../firestore/writeDocument.js";
import {
  GitError,
  assertInsideGitRepository,
  showFileAtCommit,
} from "../git/git.js";
import {
  normalizeDocumentPath,
  normalizeSlashes,
} from "../paths/backupPaths.js";
import { buildLineDiff } from "./restorePreview.js";

interface RestoreFirestoreOptions {
  from?: string;
  confirm?: boolean;
}

interface FirestoreTarget {
  backupPath: string;
  collection: string;
  documentId: string;
}

function getFirestoreTarget(inputPath: string, outputDir: string): FirestoreTarget {
  const normalizedInput = normalizeSlashes(inputPath);
  const normalizedOutputDir = normalizeSlashes(outputDir);

  if (
    normalizedInput === normalizedOutputDir ||
    normalizedInput === normalizedOutputDir.split("/")[0] ||
    (!normalizedInput.includes("/") && !normalizedInput.endsWith(".json"))
  ) {
    throw new ConfigError(
      "Collection restore is not supported yet. Provide a document path such as users/abc123.",
    );
  }

  const backupPath = normalizeDocumentPath(inputPath, outputDir);
  const relativePath = path.posix.relative(normalizedOutputDir, backupPath);
  const parts = relativePath.split("/");

  if (parts.length !== 2 || !parts[1].endsWith(".json")) {
    throw new ConfigError(
      "Only top-level document restore is supported. Provide a path such as users/abc123.",
    );
  }

  return {
    backupPath,
    collection: parts[0],
    documentId: parts[1].slice(0, -".json".length),
  };
}

function parseRestoreJson(content: string, backupPath: string): Record<string, unknown> {
  let parsed: unknown;

  try {
    parsed = JSON.parse(content);
  } catch {
    throw new ConfigError(`Malformed JSON at source commit for ${backupPath}.`);
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ConfigError(
      `Malformed JSON at source commit for ${backupPath}: expected a JSON object.`,
    );
  }

  return parsed as Record<string, unknown>;
}

function printFirestorePreview(
  target: FirestoreTarget,
  sourceCommit: string,
  currentExists: boolean,
  diff: string[],
): void {
  console.log(`Target backup path: ${target.backupPath}`);
  console.log(`Firestore collection: ${target.collection}`);
  console.log(`Firestore document ID: ${target.documentId}`);
  console.log(`Source commit: ${sourceCommit}`);
  console.log(`Current local backup file exists: ${currentExists ? "yes" : "no"}`);
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

export async function runRestoreFirestore(
  inputPath: string,
  options: RestoreFirestoreOptions,
): Promise<void> {
  if (!options.from) {
    throw new ConfigError("Missing required option: --from <commit>");
  }

  if (!options.confirm) {
    throw new ConfigError(
      "Missing required option: --confirm. Run restore-preview first, then rerun with --confirm to overwrite the Firestore document.",
    );
  }

  const config = loadConfig();
  const target = getFirestoreTarget(inputPath, config.outputDir);

  assertInsideGitRepository();

  const restoredContent = showFileAtCommit(options.from, target.backupPath);
  const restoredData = parseRestoreJson(restoredContent, target.backupPath);
  const currentExists = existsSync(target.backupPath);
  const currentContent = currentExists
    ? readFileSync(target.backupPath, "utf-8")
    : undefined;
  const diff = buildLineDiff(currentContent, restoredContent);

  printFirestorePreview(target, options.from, currentExists, diff);

  await writeDocument(target.collection, target.documentId, restoredData);

  console.log("");
  console.log(
    `Restored Firestore document: ${target.collection}/${target.documentId}`,
  );
}

export const restoreFirestoreCommand = new Command("restore-firestore")
  .description("Restore a backed-up document from Git directly into Firestore")
  .argument("<path>", "Logical document path or backup file path")
  .option("--from <commit>", "Git commit to restore from")
  .option("--confirm", "Confirm overwriting the Firestore document")
  .action(async (inputPath: string, options: RestoreFirestoreOptions) => {
    try {
      await runRestoreFirestore(inputPath, options);
    } catch (error) {
      if (
        error instanceof ConfigError ||
        error instanceof GitError ||
        error instanceof FirestoreError
      ) {
        console.error(error.message);
        process.exitCode = 1;
        return;
      }

      throw error;
    }
  });
