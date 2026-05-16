import { execFileSync } from "node:child_process";

export interface FileChanges {
  added: string[];
  modified: string[];
  deleted: string[];
}

export class GitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GitError";
  }
}

function runGit(args: string[]): string {
  try {
    return execFileSync("git", args, {
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

export function assertInsideGitRepository(): void {
  let result: string;

  try {
    result = runGit(["rev-parse", "--is-inside-work-tree"]).trim();
  } catch {
    throw new GitError("Current directory is not inside a Git repository.");
  }

  if (result !== "true") {
    throw new GitError("Current directory is not inside a Git repository.");
  }
}

export function hasChangesUnder(path: string): boolean {
  return runGit(["status", "--porcelain", "--", path]).trim() !== "";
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

export function getWorkingTreeChanges(path: string): FileChanges {
  const output = runGit(["status", "--porcelain", "--", path]);
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

export function getHistoricalChanges(path: string, since: string): FileChanges {
  const output = runGit([
    "log",
    `--since=${since}`,
    "--name-status",
    "--format=",
    "--",
    path,
  ]);
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

export function stagePath(path: string): void {
  runGit(["add", "--", path]);
}

export function commitPath(message: string, path: string): void {
  runGit(["commit", "-m", message, "--", path]);
}
