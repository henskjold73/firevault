import { execFileSync } from "node:child_process";

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

export function stagePath(path: string): void {
  runGit(["add", "--", path]);
}

export function commitPath(message: string, path: string): void {
  runGit(["commit", "-m", message, "--", path]);
}
