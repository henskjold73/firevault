import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { Command } from "commander";
import { ConfigError, findWorkspaceRoot, loadConfig } from "../config/loadConfig.js";
import {
  getRemoteUrl,
  getTrackedFiles,
  hasChangesUnder,
  hasWorkingTreeChanges,
  isInsideGitRepository,
  isPathIgnored,
} from "../git/git.js";

type DoctorSeverity = "OK" | "WARN" | "FAIL";

interface DoctorCheck {
  severity: DoctorSeverity;
  label: string;
  fix?: string;
}

function findNearestWorkspaceDir(startDir = process.cwd()): string | undefined {
  let currentDir = path.resolve(startDir);

  while (true) {
    const candidate = path.join(currentDir, ".firevault");

    if (existsSync(candidate)) {
      return candidate;
    }

    const parent = path.dirname(currentDir);

    if (parent === currentDir) {
      return undefined;
    }

    currentDir = parent;
  }
}

function addCheck(
  checks: DoctorCheck[],
  severity: DoctorSeverity,
  label: string,
  fix?: string,
): void {
  checks.push({ severity, label, fix });
}

function displayPathFromApp(workspaceRoot: string, targetPath: string): string {
  return path.relative(path.dirname(workspaceRoot), targetPath).replaceAll("\\", "/");
}

function isInside(parent: string, child: string): boolean {
  const relativePath = path.relative(parent, child);

  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

function gitignoreContains(workspaceRoot: string, value: string): boolean {
  const gitignorePath = path.join(workspaceRoot, ".gitignore");

  if (!existsSync(gitignorePath)) {
    return false;
  }

  const normalizedValue = value.replaceAll("\\", "/").replace(/^\.\//, "");
  const basename = path.posix.basename(normalizedValue);
  const lines = readFileSync(gitignorePath, "utf-8")
    .split("\n")
    .map((line) => line.trim().replace(/\/+$/, ""))
    .filter((line) => line !== "" && !line.startsWith("#"));

  return lines.includes(normalizedValue) || lines.includes(`./${normalizedValue}`) || lines.includes(basename);
}

function workflowChecks(checks: DoctorCheck[], workspaceRoot: string): void {
  const workflowPath = path.join(
    workspaceRoot,
    ".github",
    "workflows",
    "firevault-snapshot.yml",
  );

  if (!existsSync(workflowPath)) {
    addCheck(
      checks,
      "WARN",
      "GitHub Actions workflow missing",
      "Run `firevault setup-github-action`",
    );
    return;
  }

  const workflow = readFileSync(workflowPath, "utf-8");
  const missing: string[] = [];

  if (!workflow.includes("schedule:") || !workflow.includes("cron:")) {
    missing.push("schedule trigger");
  }

  if (!workflow.includes("workflow_dispatch:")) {
    missing.push("workflow_dispatch");
  }

  if (!workflow.includes("FIREVAULT_SERVICE_ACCOUNT_JSON")) {
    missing.push("FIREVAULT_SERVICE_ACCOUNT_JSON");
  }

  if (!workflow.includes("firevault snapshot")) {
    missing.push("firevault snapshot");
  }

  if (missing.length === 0) {
    addCheck(checks, "OK", "GitHub Actions workflow configured");
    return;
  }

  addCheck(
    checks,
    "WARN",
    `GitHub Actions workflow incomplete: missing ${missing.join(", ")}`,
    "Review .firevault/.github/workflows/firevault-snapshot.yml or rerun `firevault setup-github-action --force`",
  );
}

function isObviousSecretPath(filePath: string, serviceAccountPath: string): boolean {
  const normalized = filePath.replaceAll("\\", "/");
  const basename = path.posix.basename(normalized);

  return (
    normalized === serviceAccountPath ||
    basename === "serviceAccountKey.json" ||
    basename === "service-account.json" ||
    basename === "firebase-service-account.json" ||
    normalized === "credentials/firebase.json" ||
    basename === ".env" ||
    basename.startsWith(".env.") ||
    basename.endsWith(".pem") ||
    basename.endsWith(".key")
  );
}

function printChecks(checks: DoctorCheck[]): void {
  console.log("Firevault doctor");
  console.log("");

  for (const check of checks) {
    console.log(`${check.severity.padEnd(5)} ${check.label}`);
  }

  const fixes = checks
    .map((check) => check.fix)
    .filter((fix): fix is string => Boolean(fix));
  const uniqueFixes = [...new Set(fixes)];

  if (uniqueFixes.length > 0) {
    console.log("");
    console.log("Next fixes:");

    uniqueFixes.forEach((fix, index) => {
      const [firstLine, ...rest] = fix.split("\n");
      console.log(`${index + 1}. ${firstLine}`);

      for (const line of rest) {
        console.log(`   ${line}`);
      }
    });
  }
}

export function runDoctor(): void {
  const checks: DoctorCheck[] = [];
  const workspaceRoot = findWorkspaceRoot() ?? findNearestWorkspaceDir();

  if (!workspaceRoot) {
    addCheck(checks, "FAIL", "Workspace not found", "Run `firevault init`");
    addCheck(checks, "FAIL", "Config missing", "Run `firevault init`");
    printChecks(checks);
    process.exitCode = 2;
    return;
  }

  addCheck(checks, "OK", "Workspace found");

  const configPath = path.join(workspaceRoot, "config.json");

  if (!existsSync(configPath)) {
    addCheck(
      checks,
      "FAIL",
      "Config missing",
      "Run `firevault init` or create .firevault/config.json",
    );
    printChecks(checks);
    process.exitCode = 2;
    return;
  }

  let config: ReturnType<typeof loadConfig>;

  try {
    config = loadConfig();
    addCheck(checks, "OK", "Config valid");
  } catch (error) {
    const message = error instanceof ConfigError ? error.message : "Config invalid";
    addCheck(
      checks,
      "FAIL",
      message,
      "Edit .firevault/config.json or rerun `firevault init --force`",
    );
    printChecks(checks);
    process.exitCode = 2;
    return;
  }

  const serviceAccountDisplayPath = displayPathFromApp(
    config.workspaceRoot,
    config.serviceAccountPathAbsolute,
  );

  if (!isInside(config.workspaceRoot, config.serviceAccountPathAbsolute)) {
    addCheck(
      checks,
      "FAIL",
      "Service account path is outside .firevault",
      "Set serviceAccountPath to a path inside .firevault, such as ./serviceAccountKey.json",
    );
  } else if (existsSync(config.serviceAccountPathAbsolute)) {
    addCheck(checks, "OK", "Service account file present");
  } else {
    addCheck(
      checks,
      "FAIL",
      "Service account file missing",
      `Save your Firebase service account JSON to:\n${serviceAccountDisplayPath}`,
    );
  }

  if (!isInside(config.workspaceRoot, config.outputDirPath)) {
    addCheck(
      checks,
      "FAIL",
      "Backup output path is outside .firevault",
      "Set outputDir to a path inside .firevault, such as firestore-backups",
    );
  } else if (existsSync(config.outputDirPath)) {
    addCheck(checks, "OK", "Backup output directory exists");
  } else {
    addCheck(
      checks,
      "WARN",
      "Backup output directory has not been created yet",
      "Run `firevault snapshot`",
    );
  }

  const workspaceIsGitRepo = isInsideGitRepository(config.workspaceRoot);

  if (workspaceIsGitRepo) {
    addCheck(checks, "OK", ".firevault Git repository found");
  } else {
    addCheck(
      checks,
      "FAIL",
      ".firevault is not a Git repository",
      "git -C .firevault init",
    );
  }

  if (workspaceIsGitRepo && getRemoteUrl("origin", config.workspaceRoot)) {
    addCheck(checks, "OK", "Git remote origin configured");
  } else {
    addCheck(
      checks,
      "WARN",
      "No Git remote origin configured",
      "git -C .firevault remote add origin <private-repo-url>",
    );
  }

  workflowChecks(checks, config.workspaceRoot);

  const serviceAccountIgnored = workspaceIsGitRepo
    ? isPathIgnored(config.serviceAccountPath, config.workspaceRoot)
    : undefined;

  if (serviceAccountIgnored === true || gitignoreContains(config.workspaceRoot, config.serviceAccountPath)) {
    addCheck(checks, "OK", "Service account file ignored");
  } else {
    addCheck(
      checks,
      "FAIL",
      "Service account file is not ignored",
      `Add ${config.serviceAccountPath} to .firevault/.gitignore`,
    );
  }

  const appRoot = path.dirname(config.workspaceRoot);

  if (!isInsideGitRepository(appRoot)) {
    addCheck(checks, "WARN", "Parent app directory is not a Git repository");
  } else if (isPathIgnored(".firevault", appRoot)) {
    addCheck(checks, "OK", "Parent app repo ignores .firevault/");
  } else {
    addCheck(
      checks,
      "FAIL",
      "Parent app repo does not ignore .firevault/",
      "Add .firevault/ to .gitignore",
    );
  }

  if (workspaceIsGitRepo) {
    const trackedFiles = getTrackedFiles(config.workspaceRoot) ?? [];
    const trackedSecretFiles = trackedFiles.filter((filePath) =>
      isObviousSecretPath(filePath, config.serviceAccountPath),
    );

    if (trackedSecretFiles.length === 0) {
      addCheck(checks, "OK", "No obvious secret files tracked");
    } else {
      addCheck(
        checks,
        "FAIL",
        `Possible secret files tracked: ${trackedSecretFiles.join(", ")}`,
        "Remove tracked secret files from Git history and rotate exposed credentials.",
      );
    }

    if (
      isPathIgnored(config.outputDir, config.workspaceRoot) ||
      gitignoreContains(config.workspaceRoot, config.outputDir)
    ) {
      addCheck(
        checks,
        "FAIL",
        "Backup directory is ignored",
        `Remove ${config.outputDir}/ from .firevault/.gitignore`,
      );
    } else {
      addCheck(checks, "OK", "Backup directory is trackable");
    }

    if (hasWorkingTreeChanges(config.workspaceRoot)) {
      addCheck(
        checks,
        "WARN",
        "Working tree has uncommitted changes",
        "Review changes, then run `firevault commit` when appropriate",
      );
    } else {
      addCheck(checks, "OK", "Working tree clean");
    }

    if (hasChangesUnder(config.outputDir, config.workspaceRoot)) {
      addCheck(
        checks,
        "WARN",
        "Backup output has uncommitted changes",
        "Run `firevault commit` after reviewing changes",
      );
    }
  }

  printChecks(checks);

  if (checks.some((check) => check.severity === "FAIL")) {
    process.exitCode = 2;
    return;
  }

  if (checks.some((check) => check.severity === "WARN")) {
    process.exitCode = 1;
  }
}

export const doctorCommand = new Command("doctor")
  .description("Validate local Firevault recovery setup")
  .action(() => {
    runDoctor();
  });
