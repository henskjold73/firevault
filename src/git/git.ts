import { execFileSync } from "node:child_process";

export interface FileChanges {
  added: string[];
  modified: string[];
  deleted: string[];
}

export interface HistoryEntry {
  shortSha: string;
  date: string;
  message: string;
  changedFileCount?: number;
}

export class GitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GitError";
  }
}

function runGit(args: string[], cwd = process.cwd()): string {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "stderr" in error &&
      typeof error.stderr === "string" &&
      error.stderr.trim() !== ""
    ) {
      throw new GitError(error.stderr.trim());
    }

    throw new GitError("Git command failed.");
  }
}

export function isInsideGitRepository(cwd = process.cwd()): boolean {
  try {
    return runGit(["rev-parse", "--is-inside-work-tree"], cwd).trim() === "true";
  } catch {
    return false;
  }
}

export function assertInsideGitRepository(cwd = process.cwd()): void {
  if (!isInsideGitRepository(cwd)) {
    throw new GitError("Current directory is not inside a Git repository.");
  }
}

export function initGitRepository(cwd = process.cwd()): void {
  runGit(["init"], cwd);
}

export function hasWorkingTreeChanges(cwd = process.cwd()): boolean {
  return runGit(["status", "--porcelain"], cwd).trim() !== "";
}

export function hasChangesUnder(path: string, cwd = process.cwd()): boolean {
  return runGit(["status", "--porcelain", "--ignored", "--", path], cwd).trim() !== "";
}

function emptyFileChanges(): FileChanges {
  return {
    added: [],
    modified: [],
    deleted: [],
  };
}

function addFileChange(changes: FileChanges, status: string, filePath: string): void {
  if (status.includes("D")) {
    changes.deleted.push(filePath);
    return;
  }

  if (status.includes("A") || status === "??") {
    changes.added.push(filePath);
    return;
  }

  changes.modified.push(filePath);
}

function dedupeSorted(paths: string[]): string[] {
  return [...new Set(paths)].sort();
}

function normalizeFileChanges(changes: FileChanges): FileChanges {
  const deleted = new Set(changes.deleted);
  const added = new Set(changes.added.filter((path) => !deleted.has(path)));
  const modified = new Set(
    changes.modified.filter((path) => !deleted.has(path) && !added.has(path)),
  );

  return {
    added: dedupeSorted([...added]),
    modified: dedupeSorted([...modified]),
    deleted: dedupeSorted([...deleted]),
  };
}

export function getWorkingTreeChanges(path: string, cwd = process.cwd()): FileChanges {
  const output = runGit(["status", "--porcelain", "--", path], cwd);
  const changes = emptyFileChanges();

  for (const line of output.split("\n")) {
    if (line.trim() === "") {
      continue;
    }

    const status = line.slice(0, 2);
    const filePath = line.slice(3).trim();

    addFileChange(changes, status, filePath);
  }

  return normalizeFileChanges(changes);
}

export function getHistoricalChanges(
  path: string,
  since: string,
  cwd = process.cwd(),
): FileChanges {
  const output = runGit([
    "log",
    `--since=${since}`,
    "--name-status",
    "--format=",
    "--",
    path,
  ], cwd);
  const changes = emptyFileChanges();

  for (const line of output.split("\n")) {
    if (line.trim() === "") {
      continue;
    }

    const [status, filePath] = line.split("\t");

    if (!status || !filePath) {
      continue;
    }

    addFileChange(changes, status, filePath);
  }

  return normalizeFileChanges(changes);
}

export function getHistory(
  path: string,
  includeChangedFileCount: boolean,
  cwd = process.cwd(),
): HistoryEntry[] {
  const format = "%h%x09%cs%x09%s";
  const output = runGit(["log", `--format=${format}`, "--name-only", "--", path], cwd);
  const entries: HistoryEntry[] = [];
  let current: HistoryEntry | undefined;
  let changedFiles = new Set<string>();

  function finishCurrent(): void {
    if (!current) {
      return;
    }

    if (includeChangedFileCount) {
      current.changedFileCount = changedFiles.size;
    }

    entries.push(current);
  }

  for (const line of output.split("\n")) {
    if (line.trim() === "") {
      continue;
    }

    const parts = line.split("\t");

    if (parts.length >= 3) {
      finishCurrent();
      current = {
        shortSha: parts[0],
        date: parts[1],
        message: parts.slice(2).join("\t"),
      };
      changedFiles = new Set<string>();
      continue;
    }

    changedFiles.add(line.trim());
  }

  finishCurrent();

  return entries;
}

export function showFileAtCommit(commit: string, path: string, cwd = process.cwd()): string {
  try {
    return runGit(["show", `${commit}:${path}`], cwd);
  } catch {
    throw new GitError(`File not found at ${commit}: ${path}`);
  }
}

export function stagePath(path: string, cwd = process.cwd()): void {
  runGit(["add", "-f", "--", path], cwd);
}

export function commitPath(message: string, path: string, cwd = process.cwd()): void {
  runGit(["commit", "-m", message, "--", path], cwd);
}
