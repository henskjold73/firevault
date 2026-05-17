import { Command } from "commander";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import {
  appendFileSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import {
  GitError,
  hasWorkingTreeChanges,
  initGitRepository,
  isInsideGitRepository,
} from "../git/git.js";
import {
  detectFirebaseProjectCandidates,
  uniqueProjectIds,
} from "../init/detectFirebaseProject.js";
import type { FirebaseProjectCandidate } from "../init/detectFirebaseProject.js";
import { detectServiceAccountPaths } from "../init/detectServiceAccount.js";
import { listFirestoreCollections } from "../init/listCollections.js";

interface InitOptions {
  force?: boolean;
  yes?: boolean;
}

interface InitConfig {
  projectId: string;
  serviceAccountPath: string;
  outputDir: string;
  collections: string[];
}

const defaultConfig: InitConfig = {
  projectId: "your-firebase-project-id",
  serviceAccountPath: "./serviceAccountKey.json",
  outputDir: "firestore-backups",
  collections: ["users"],
};

function validateConfig(config: InitConfig): void {
  if (config.projectId.trim() === "") {
    throw new Error("Firebase project ID is required.");
  }

  if (config.serviceAccountPath.trim() === "") {
    throw new Error("Service account path is required.");
  }

  if (config.outputDir.trim() === "") {
    throw new Error("Output directory is required.");
  }

  if (config.collections.length === 0) {
    throw new Error("At least one collection is required.");
  }

  if (config.collections.some((collection) => collection.trim() === "")) {
    throw new Error("Collection names must not be empty.");
  }
}

function parseCollections(value: string): string[] {
  return value
    .split(",")
    .map((collection) => collection.trim())
    .filter((collection) => collection !== "");
}

function getServiceAccountUrl(projectId: string): string {
  return `https://console.firebase.google.com/project/${encodeURIComponent(projectId)}/settings/serviceaccounts/adminsdk`;
}

function printServiceAccountGuidance(
  projectId: string,
  serviceAccountPath: string,
): void {
  console.log("");
  console.log("Create a Firebase service account key here:");
  console.log("");
  console.log(getServiceAccountUrl(projectId));
  console.log("");
  console.log("Download the JSON key and save it as:");
  console.log("");
  console.log(serviceAccountPath);
  console.log("");
}

function printMissingServiceAccountInfo(serviceAccountPath: string): void {
  if (existsSync(serviceAccountPath)) {
    return;
  }

  console.log(
    `Service account file does not exist yet: ${serviceAccountPath}`,
  );
  console.log(
    "That is expected before downloading the Firebase Admin SDK key.",
  );
  console.log(`Save the downloaded JSON key at: ${serviceAccountPath}`);
  console.log("");
}

function gitignorePathFor(filePath: string): string {
  return filePath.replace(/\\/g, "/").replace(/^\.\//, "");
}

function printDetectedProjectCandidates(
  candidates: FirebaseProjectCandidate[],
): void {
  if (candidates.length === 0) {
    return;
  }

  console.log("Detected Firebase project IDs:");
  console.log("");

  candidates.forEach((candidate, index) => {
    console.log(
      `${index + 1}. ${candidate.projectId} from ${candidate.source}`,
    );
  });

  console.log("");
}

async function promptForProjectId(
  rl: PromptInterface,
  candidates: FirebaseProjectCandidate[],
): Promise<string> {
  const projectIds = uniqueProjectIds(candidates);

  if (projectIds.length === 0) {
    return (await rl.question("Firebase project ID: ")).trim();
  }

  printDetectedProjectCandidates(candidates);

  if (projectIds.length === 1) {
    return (
      await rl.question(`Firebase project ID (${projectIds[0]}): `)
    ).trim() || projectIds[0];
  }

  const answer = (
    await rl.question("Select Firebase project ID by number or enter one manually: ")
  ).trim();
  const selection = Number(answer);

  if (Number.isInteger(selection) && selection >= 1 && selection <= candidates.length) {
    return candidates[selection - 1].projectId;
  }

  return answer;
}

function suggestedServiceAccountPath(detectedPaths: string[]): string {
  return detectedPaths[0] ?? defaultConfig.serviceAccountPath;
}

function printDetectedServiceAccounts(detectedPaths: string[]): void {
  if (detectedPaths.length === 0) {
    return;
  }

  console.log("Detected possible service account files:");
  console.log("");

  detectedPaths.forEach((filePath, index) => {
    console.log(`${index + 1}. ${filePath}`);
  });

  console.log("");
}

async function promptForServiceAccountPath(
  rl: PromptInterface,
  detectedPaths: string[],
): Promise<string> {
  printDetectedServiceAccounts(detectedPaths);

  const suggestedPath = suggestedServiceAccountPath(detectedPaths);
  const answer = (
    await rl.question(`Service account path (${suggestedPath}): `)
  ).trim();
  const selection = Number(answer);

  if (
    detectedPaths.length > 0 &&
    Number.isInteger(selection) &&
    selection >= 1 &&
    selection <= detectedPaths.length
  ) {
    return detectedPaths[selection - 1];
  }

  return answer || suggestedPath;
}

function parseSelectedCollections(inputValue: string, detectedCollections: string[]): string[] {
  const selectedCollections: string[] = [];

  for (const item of inputValue.split(",")) {
    const value = item.trim();

    if (value === "") {
      continue;
    }

    const selection = Number(value);

    if (
      Number.isInteger(selection) &&
      selection >= 1 &&
      selection <= detectedCollections.length
    ) {
      selectedCollections.push(detectedCollections[selection - 1]);
      continue;
    }

    selectedCollections.push(value);
  }

  return [...new Set(selectedCollections)];
}

async function promptForCollectionListing(
  rl: PromptInterface,
  projectId: string,
  serviceAccountPath: string,
): Promise<string[] | undefined> {
  if (!existsSync(serviceAccountPath)) {
    console.log(
      `Service account file is not present, so collection detection is skipped: ${serviceAccountPath}`,
    );
    console.log("");
    return undefined;
  }

  const answer = (
    await rl.question("Try to list Firestore collections with this service account? (y/N): ")
  )
    .trim()
    .toLowerCase();

  if (answer !== "y" && answer !== "yes") {
    return undefined;
  }

  console.log("Connecting to Firestore to list top-level collections...");

  let detectedCollections: string[];

  try {
    detectedCollections = await listFirestoreCollections(projectId, serviceAccountPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`Could not list Firestore collections: ${message}`);
    console.log("You can enter collection names manually.");
    console.log("");
    return undefined;
  }

  if (detectedCollections.length === 0) {
    console.log("No top-level Firestore collections were detected.");
    console.log("");
    return undefined;
  }

  console.log("");
  console.log("Detected Firestore collections:");
  console.log("");
  detectedCollections.forEach((collection, index) => {
    console.log(`${index + 1}. ${collection}`);
  });
  console.log("");

  const selected = (
    await rl.question("Collections to back up, comma-separated numbers or names: ")
  ).trim();

  if (selected === "") {
    return undefined;
  }

  return parseSelectedCollections(selected, detectedCollections);
}

type PromptInterface = ReturnType<typeof createInterface>;

async function promptForConfig(
  options: InitOptions,
  rl?: PromptInterface,
): Promise<InitConfig> {
  const projectCandidates = detectFirebaseProjectCandidates();
  const serviceAccountPaths = detectServiceAccountPaths();

  if (options.yes) {
    return {
      ...defaultConfig,
      projectId: uniqueProjectIds(projectCandidates)[0] ?? defaultConfig.projectId,
    };
  }

  if (!rl) {
    throw new Error("Prompt interface is required for interactive init.");
  }

  const projectId = await promptForProjectId(rl, projectCandidates);

  if (projectId !== "") {
    printServiceAccountGuidance(projectId, defaultConfig.serviceAccountPath);
  }

  const serviceAccountPath = await promptForServiceAccountPath(
    rl,
    serviceAccountPaths,
  );
  const outputDir =
    (
      await rl.question(`Output directory (${defaultConfig.outputDir}): `)
    ).trim() || defaultConfig.outputDir;
  const detectedCollections = await promptForCollectionListing(
    rl,
    projectId,
    serviceAccountPath,
  );
  const collectionsInput = detectedCollections
    ? detectedCollections.join(",")
    : (await rl.question("Collections, comma-separated: ")).trim();

  return {
    projectId,
    serviceAccountPath,
    outputDir,
    collections: parseCollections(collectionsInput),
  };
}

async function promptForGitInit(
  options: InitOptions,
  rl?: PromptInterface,
): Promise<boolean> {
  if (options.yes) {
    return true;
  }

  if (!rl) {
    throw new Error("Prompt interface is required for interactive init.");
  }

  const answer = (
    await rl.question("This directory is not a Git repository. Run git init? (Y/n): ")
  )
    .trim()
    .toLowerCase();

  return answer === "" || answer === "y" || answer === "yes";
}

function ensureGitignoreEntries(entries: string[]): void {
  const gitignorePath = ".gitignore";
  const existing = existsSync(gitignorePath)
    ? readFileSync(gitignorePath, "utf-8")
    : "";
  const existingLines = new Set(
    existing
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== ""),
  );
  const missingEntries = [...new Set(entries)].filter(
    (entry) => !existingLines.has(entry),
  );

  if (missingEntries.length === 0) {
    return;
  }

  const prefix = existing.length > 0 && !existing.endsWith("\n") ? "\n" : "";
  appendFileSync(
    gitignorePath,
    `${prefix}${missingEntries.join("\n")}\n`,
  );
}

export async function runInit(options: InitOptions): Promise<void> {
  console.log("Firevault");
  console.log("Undo button for Firestore.");
  console.log("");

  const configPath = "firevault.config.json";
  const alreadyInGitRepository = isInsideGitRepository();
  const rl = options.yes ? undefined : createInterface({ input, output });

  try {
    if (alreadyInGitRepository && hasWorkingTreeChanges() && !options.force) {
      throw new Error(
        "Git working tree has changes. Commit, stash, or rerun with --force before init writes files.",
      );
    }

    if (existsSync(configPath) && !options.force) {
      throw new Error(
        "firevault.config.json already exists. Rerun with --force to overwrite it.",
      );
    }

    const shouldInitGit = alreadyInGitRepository
      ? false
      : await promptForGitInit(options, rl);
    const config = await promptForConfig(options, rl);

    config.collections = config.collections.map((collection) => collection.trim());
    validateConfig(config);

    if (options.yes) {
      printServiceAccountGuidance(config.projectId, config.serviceAccountPath);
    }

    printMissingServiceAccountInfo(config.serviceAccountPath);

    if (shouldInitGit) {
      initGitRepository();
      console.log("Initialized Git repository.");
    }

    if (existsSync(configPath) && options.force) {
      console.log("Warning: overwriting existing firevault.config.json.");
    }

    writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

    ensureGitignoreEntries([
      "serviceAccountKey.json",
      gitignorePathFor(config.serviceAccountPath),
      "firestore-backups/",
      "firestore-debug.log",
    ]);

    console.log("Created firevault.config.json.");
    console.log("Updated .gitignore safety entries.");
    console.log("");
    console.log("Next steps:");
    console.log(`1. Save your service account key at ${config.serviceAccountPath}`);
    console.log("2. Run `firevault snapshot`");
    console.log("3. Run `firevault changes`");
    console.log(
      "4. Run `firevault restore-preview <path> --from <commit>` before a real restore",
    );
  } finally {
    rl?.close();
  }
}

export const initCommand = new Command("init")
  .description("Create a guided Firevault configuration")
  .option("--force", "Allow init with a dirty Git tree and overwrite existing config")
  .option("--yes", "Use defaults and skip prompts")
  .action(async (options: InitOptions) => {
    try {
      await runInit(options);
    } catch (error) {
      if (error instanceof GitError || error instanceof Error) {
        console.error(error.message);
        process.exitCode = 1;
        return;
      }

      throw error;
    }
  });
