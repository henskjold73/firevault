import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { Command } from "commander";
import { ConfigError, findWorkspaceRoot, loadConfig } from "../config/loadConfig.js";
import {
  getAheadBehind,
  getCurrentBranch,
  getLatestCommitDate,
  getRemoteUrl,
  hasChangesUnder,
  hasWorkingTreeChanges,
  isInsideGitRepository,
} from "../git/git.js";

function relativeDisplayPath(targetPath: string): string {
  const relativePath = path.relative(process.cwd(), targetPath);

  if (relativePath === "") {
    return ".";
  }

  return relativePath.startsWith("..") ? targetPath : relativePath || ".";
}

function workflowStatus(workspaceRoot: string): string {
  const workflowPath = path.join(
    workspaceRoot,
    ".github",
    "workflows",
    "firevault-snapshot.yml",
  );

  if (!existsSync(workflowPath)) {
    return "not configured";
  }

  try {
    const workflow = readFileSync(workflowPath, "utf-8");

    if (workflow.includes("schedule:") && workflow.includes("cron:")) {
      return "configured";
    }

    return "present, schedule missing";
  } catch {
    return "present, unreadable";
  }
}

function printMissingWorkspace(): void {
  console.log("Firevault status");
  console.log("");
  console.log("Workspace:");
  console.log("  Path: not found");
  console.log("  Config: missing");
  console.log("");
  console.log("Next step:");
  console.log("  Run `firevault init`");
  process.exitCode = 1;
}

function formatRemoteSync(sync: ReturnType<typeof getAheadBehind>): string {
  if (!sync) {
    return "unknown";
  }

  return `ahead ${sync.ahead}, behind ${sync.behind}`;
}

export function runStatus(): void {
  const workspaceRoot = findWorkspaceRoot();

  if (!workspaceRoot) {
    printMissingWorkspace();
    return;
  }

  let config;

  try {
    config = loadConfig();
  } catch (error) {
    if (error instanceof ConfigError) {
      console.log("Firevault status");
      console.log("");
      console.log("Workspace:");
      console.log(`  Path: ${relativeDisplayPath(workspaceRoot)}`);
      console.log("  Config: invalid");
      console.log("");
      console.log(`Error: ${error.message}`);
      process.exitCode = 1;
      return;
    }

    throw error;
  }

  const gitRepositoryExists = isInsideGitRepository(config.workspaceRoot);
  const outputDirExists = existsSync(config.outputDirPath);
  const workingTreeDirty = gitRepositoryExists
    ? hasWorkingTreeChanges(config.workspaceRoot)
    : undefined;
  const backupChanges = gitRepositoryExists
    ? hasChangesUnder(config.outputDir, config.workspaceRoot)
    : undefined;
  const latestSnapshot = gitRepositoryExists
    ? getLatestCommitDate(config.outputDir, config.workspaceRoot)
    : undefined;
  const branch = gitRepositoryExists
    ? getCurrentBranch(config.workspaceRoot)
    : undefined;
  const remoteOrigin = gitRepositoryExists
    ? getRemoteUrl("origin", config.workspaceRoot)
    : undefined;
  const remoteSync = gitRepositoryExists && remoteOrigin
    ? getAheadBehind(config.workspaceRoot)
    : undefined;

  console.log("Firevault status");
  console.log("");
  console.log("Workspace:");
  console.log(`  Path: ${relativeDisplayPath(config.workspaceRoot)}`);
  console.log("  Config: OK");
  console.log("");
  console.log("Firestore:");
  console.log(`  Project: ${config.projectId}`);
  console.log(`  Collections configured: ${config.collections.length}`);
  console.log("");
  console.log("Backups:");
  console.log(`  Output directory: ${config.outputDir}`);
  console.log(`  Output exists: ${outputDirExists ? "yes" : "no"}`);
  console.log(`  Last snapshot: ${latestSnapshot ?? "none"}`);
  console.log(
    `  Uncommitted backup changes: ${
      backupChanges === undefined ? "unknown" : backupChanges ? "yes" : "none"
    }`,
  );
  console.log("");
  console.log("Git:");
  console.log(`  Repository: ${gitRepositoryExists ? "OK" : "missing"}`);

  if (gitRepositoryExists) {
    console.log(`  Branch: ${branch ?? "unknown"}`);
    console.log(`  Working tree: ${workingTreeDirty ? "dirty" : "clean"}`);
    console.log(`  Remote origin: ${remoteOrigin ? "configured" : "not configured"}`);

    if (remoteOrigin) {
      console.log(`  Remote sync: ${formatRemoteSync(remoteSync)}`);
    }
  }

  console.log("");
  console.log("Automation:");
  console.log(
    `  GitHub Actions workflow: ${workflowStatus(config.workspaceRoot)}`,
  );
}

export const statusCommand = new Command("status")
  .description("Show local Firevault recovery health")
  .action(() => {
    runStatus();
  });
