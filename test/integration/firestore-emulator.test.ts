import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import admin from "firebase-admin";

const projectRoot = path.resolve(import.meta.dirname, "../..");
const cliPath = path.join(projectRoot, "src/index.ts");
const tsxPath = path.join(projectRoot, "node_modules/.bin/tsx");
const projectId = "demo-firevault-test";
const tempRoots: string[] = [];

function requireEmulator(): string {
  const host = process.env.FIRESTORE_EMULATOR_HOST;

  if (!host) {
    throw new Error(
      "FIRESTORE_EMULATOR_HOST is not set. Run tests with `npm run test:emulator`.",
    );
  }

  return host;
}

async function clearFirestore(): Promise<void> {
  const host = requireEmulator();
  const response = await fetch(
    `http://${host}/emulator/v1/projects/${projectId}/databases/(default)/documents`,
    { method: "DELETE" },
  );

  if (!response.ok) {
    throw new Error(`Failed to clear Firestore emulator: ${response.status}`);
  }
}

function getDb(): FirebaseFirestore.Firestore {
  const existing = admin.apps.find((app) => app?.name === "firevault-tests");

  if (existing) {
    return admin.firestore(existing);
  }

  const app = admin.initializeApp({ projectId }, "firevault-tests");

  return admin.firestore(app);
}

function makeTempRepo(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "firevault-test-"));
  tempRoots.push(dir);

  writeFileSync(
    path.join(dir, "firevault.config.json"),
    JSON.stringify(
      {
        projectId,
        serviceAccountPath: "./missing-serviceAccountKey.json",
        outputDir: "firestore-backups",
        collections: ["users"],
      },
      null,
      2,
    ),
  );

  execFileSync("git", ["init"], { cwd: dir, stdio: "ignore" });
  execFileSync("git", ["config", "user.email", "firevault-test@example.com"], {
    cwd: dir,
  });
  execFileSync("git", ["config", "user.name", "Firevault Test"], { cwd: dir });

  return dir;
}

function runFirevault(
  cwd: string,
  args: string[],
): { stdout: string; stderr: string; status: number } {
  try {
    const stdout = execFileSync(tsxPath, [cliPath, ...args], {
      cwd,
      encoding: "utf-8",
      env: {
        ...process.env,
        FIRESTORE_EMULATOR_HOST: requireEmulator(),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    return { stdout, stderr: "", status: 0 };
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "status" in error &&
      "stdout" in error &&
      "stderr" in error
    ) {
      return {
        stdout: String(error.stdout),
        stderr: String(error.stderr),
        status: Number(error.status),
      };
    }

    throw error;
  }
}

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf-8" });
}

beforeEach(async () => {
  await clearFirestore();
});

after(async () => {
  await Promise.all(admin.apps.map((app) => app?.delete()));

  for (const dir of tempRoots) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("Firestore emulator integration", () => {
  it("backup exports a known document from emulator Firestore", async () => {
    const repo = makeTempRepo();
    const db = getDb();

    await db.collection("users").doc("abc123").set({
      active: true,
      name: "Ada",
    });

    const result = runFirevault(repo, ["backup"]);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /Exported 1 docs from users/);
    assert.equal(
      readFileSync(
        path.join(repo, "firestore-backups/users/abc123.json"),
        "utf-8",
      ),
      '{\n  "active": true,\n  "name": "Ada"\n}',
    );
  });

  it("backup writes deterministic JSON", async () => {
    const repo = makeTempRepo();
    const db = getDb();

    await db.collection("users").doc("sorted").set({
      z: 2,
      a: {
        z: 3,
        a: 1,
      },
    });

    const result = runFirevault(repo, ["backup"]);

    assert.equal(result.status, 0);
    assert.equal(
      readFileSync(
        path.join(repo, "firestore-backups/users/sorted.json"),
        "utf-8",
      ),
      '{\n  "a": {\n    "a": 1,\n    "z": 3\n  },\n  "z": 2\n}',
    );
  });

  it("restore-firestore overwrites one emulator document from a Git commit", async () => {
    const repo = makeTempRepo();
    const db = getDb();

    mkdirSync(path.join(repo, "firestore-backups/users"), { recursive: true });
    writeFileSync(
      path.join(repo, "firestore-backups/users/abc123.json"),
      '{\n  "name": "Ada",\n  "version": 1\n}',
    );
    git(repo, ["add", "firevault.config.json", "firestore-backups"]);
    git(repo, ["commit", "-m", "initial-backup"]);

    writeFileSync(
      path.join(repo, "firestore-backups/users/abc123.json"),
      '{\n  "name": "Ada Lovelace",\n  "version": 2\n}',
    );
    git(repo, ["add", "firestore-backups"]);
    git(repo, ["commit", "-m", "updated-backup"]);

    await db.collection("users").doc("abc123").set({
      name: "Current",
      untouched: false,
    });

    const result = runFirevault(repo, [
      "restore-firestore",
      "users/abc123",
      "--from",
      "HEAD~1",
      "--confirm",
    ]);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /Firestore collection: users/);
    assert.match(result.stdout, /Restored Firestore document: users\/abc123/);

    const restored = await db.collection("users").doc("abc123").get();
    assert.deepEqual(restored.data(), {
      name: "Ada",
      version: 1,
    });

    assert.equal(git(repo, ["log", "--oneline"]).trim().split("\n").length, 2);
  });

  it("restore-firestore rejects collection paths", () => {
    const repo = makeTempRepo();
    const result = runFirevault(repo, [
      "restore-firestore",
      "users",
      "--from",
      "HEAD",
      "--confirm",
    ]);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /Collection restore is not supported yet/);
  });

  it("restore-firestore requires --confirm", () => {
    const repo = makeTempRepo();
    const result = runFirevault(repo, [
      "restore-firestore",
      "users/abc123",
      "--from",
      "HEAD",
    ]);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /Missing required option: --confirm/);
  });
});
