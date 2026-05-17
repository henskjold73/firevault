import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import admin from "firebase-admin";
import { listFirestoreCollections } from "../../src/init/listCollections.js";

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
  const workspace = path.join(dir, ".firevault");
  tempRoots.push(dir);
  mkdirSync(workspace, { recursive: true });

  writeFileSync(
    path.join(workspace, "config.json"),
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
  execFileSync("git", ["init"], { cwd: workspace, stdio: "ignore" });
  execFileSync("git", ["config", "user.email", "firevault-test@example.com"], {
    cwd: workspace,
  });
  execFileSync("git", ["config", "user.name", "Firevault Test"], { cwd: workspace });

  return dir;
}

function workspacePath(repo: string): string {
  return path.join(repo, ".firevault");
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
        path.join(repo, ".firevault/firestore-backups/users/abc123.json"),
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
        path.join(repo, ".firevault/firestore-backups/users/sorted.json"),
        "utf-8",
      ),
      '{\n  "a": {\n    "a": 1,\n    "z": 3\n  },\n  "z": 2\n}',
    );
  });

  it("restore-firestore overwrites one emulator document from a Git commit", async () => {
    const repo = makeTempRepo();
    const db = getDb();

    const workspace = workspacePath(repo);

    mkdirSync(path.join(workspace, "firestore-backups/users"), { recursive: true });
    writeFileSync(
      path.join(workspace, "firestore-backups/users/abc123.json"),
      '{\n  "name": "Ada",\n  "version": 1\n}',
    );
    git(workspace, ["add", "config.json", "firestore-backups"]);
    git(workspace, ["commit", "-m", "initial-backup"]);

    writeFileSync(
      path.join(workspace, "firestore-backups/users/abc123.json"),
      '{\n  "name": "Ada Lovelace",\n  "version": 2\n}',
    );
    git(workspace, ["add", "firestore-backups"]);
    git(workspace, ["commit", "-m", "updated-backup"]);

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

    assert.equal(git(workspace, ["log", "--oneline"]).trim().split("\n").length, 2);
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

  it("init collection detection lists top-level collections from emulator Firestore", async () => {
    const repo = makeTempRepo();
    const serviceAccountPath = path.join(repo, ".firevault/serviceAccountKey.json");
    const db = getDb();

    writeFileSync(serviceAccountPath, "{}\n");
    await db.collection("orders").doc("order-1").set({ total: 42 });
    await db.collection("users").doc("user-1").set({ name: "Ada" });

    const collections = await listFirestoreCollections(projectId, serviceAccountPath);

    assert.deepEqual(collections, ["orders", "users"]);
  });
});
