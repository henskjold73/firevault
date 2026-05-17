import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { gitversion } from "gitversionjs";

type PackageJson = {
  name: string;
  version: string;
  [key: string]: unknown;
};

type PackFile = {
  path: string;
  size?: number;
  mode?: number;
};

type PackResult = {
  id?: string;
  name?: string;
  version?: string;
  filename?: string;
  files?: PackFile[];
};

type Options = {
  dryRun: boolean;
  yes: boolean;
  versionOnly: boolean;
  allowDirty: boolean;
};

const PACKAGE_JSON = "package.json";
const NPM_CACHE = "/private/tmp/firevault-npm-cache";

type ParsedSemver = {
  major: number;
  minor: number;
  patch: number;
  prereleaseName?: string;
  prereleaseNumber?: number;
};

function parseOptions(argv: string[]): Options {
  return {
    dryRun: argv.includes("--dry-run"),
    yes: argv.includes("--yes"),
    versionOnly: argv.includes("--version-only"),
    allowDirty: argv.includes("--allow-dirty"),
  };
}

function run(command: string, args: string[], options: { capture?: boolean } = {}): string {
  try {
    return execFileSync(command, args, {
      encoding: "utf8",
      stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    });
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Command failed: ${command} ${args.join(" ")}`);
    }

    throw error;
  }
}

function gitOutput(args: string[]): string {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function verifyCleanGitTree(options: Options): void {
  let status: string;

  try {
    status = gitOutput(["status", "--porcelain"]);
  } catch {
    throw new Error("Publishing requires a Git repository.");
  }

  if (status.trim().length === 0) {
    return;
  }

  if (options.dryRun && options.allowDirty) {
    console.log("Git working tree is dirty; continuing because this is an explicit dry run.");
    return;
  }

  throw new Error("Git working tree is dirty. Commit or stash changes before publishing.");
}

function readPackageJson(): PackageJson {
  return JSON.parse(readFileSync(PACKAGE_JSON, "utf8")) as PackageJson;
}

function writePackageJson(packageJson: PackageJson): void {
  writeFileSync(PACKAGE_JSON, `${JSON.stringify(packageJson, null, 2)}\n`);
}

function parseSemver(version: string): ParsedSemver {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)(?:-([a-zA-Z0-9-]+)\.(\d+))?$/);

  if (!match) {
    throw new Error(`Unsupported package version: ${version}`);
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prereleaseName: match[4],
    prereleaseNumber: match[5] === undefined ? undefined : Number(match[5]),
  };
}

function compareBaseVersions(left: ParsedSemver, right: ParsedSemver): number {
  if (left.major !== right.major) {
    return left.major - right.major;
  }

  if (left.minor !== right.minor) {
    return left.minor - right.minor;
  }

  return left.patch - right.patch;
}

function npmSafeVersion(rawVersion: string, currentVersion: string): string {
  const match = rawVersion.match(/^(\d+)\.(\d+)\.(\d+)(?:\.(\d+))?(?:[-+].*)?$/);

  if (!match) {
    throw new Error(`gitversionjs returned an unsupported version: ${rawVersion}`);
  }

  const [, major, minor, patch, prereleaseNumber = "0"] = match;
  const gitVersion = parseSemver(`${major}.${minor}.${patch}-beta.${prereleaseNumber}`);
  const current = parseSemver(currentVersion);

  if (compareBaseVersions(gitVersion, current) > 0) {
    return `${major}.${minor}.${patch}-beta.${prereleaseNumber}`;
  }

  if (compareBaseVersions(gitVersion, current) === 0 && current.prereleaseName === "beta") {
    const nextPrereleaseNumber = Math.max(Number(prereleaseNumber), current.prereleaseNumber ?? -1) + 1;
    return `${major}.${minor}.${patch}-beta.${nextPrereleaseNumber}`;
  }

  if (current.prereleaseName === "beta") {
    return `${current.major}.${current.minor}.${current.patch}-beta.${current.prereleaseNumber ?? 0}`;
  }

  return `${current.major}.${current.minor}.${current.patch}-beta.0`;
}

async function calculateVersion(currentVersion: string): Promise<{ rawVersion: string; npmVersion: string }> {
  const versionInfo = await gitversion();
  const npmVersion = npmSafeVersion(versionInfo.version, currentVersion);

  return {
    rawVersion: versionInfo.version,
    npmVersion,
  };
}

function updatePackageVersion(version: string): string {
  const packageJson = readPackageJson();
  const previousVersion = packageJson.version;

  packageJson.version = version;
  writePackageJson(packageJson);

  return previousVersion;
}

function parsePackOutput(output: string): PackResult {
  try {
    const parsed = JSON.parse(output) as PackResult[];
    const result = parsed[0];

    if (!result || !Array.isArray(result.files)) {
      throw new Error("missing file list");
    }

    return result;
  } catch {
    throw new Error("Could not parse npm pack dry-run output.");
  }
}

function isForbiddenPackagePath(path: string): boolean {
  return (
    path === "serviceAccountKey.json" ||
    path === "firestore-debug.log" ||
    path === "firebase.json" ||
    path === "firestore.rules" ||
    path === ".env" ||
    path.startsWith(".env.") ||
    path.includes("/.env") ||
    path === "firestore-backups" ||
    path.startsWith("firestore-backups/") ||
    path.startsWith("src/") ||
    path.startsWith("test/")
  );
}

function verifyPackageContents(files: PackFile[]): void {
  const forbiddenFiles = files.map((file) => file.path).filter(isForbiddenPackagePath);

  if (forbiddenFiles.length > 0) {
    throw new Error(`Package contains forbidden paths:\n${forbiddenFiles.map((path) => `- ${path}`).join("\n")}`);
  }
}

function printPackageContents(result: PackResult): void {
  console.log("\nPackage contents:");

  for (const file of result.files ?? []) {
    const size = typeof file.size === "number" ? ` (${file.size} bytes)` : "";
    console.log(`- ${file.path}${size}`);
  }

  console.log("");
}

function packDryRun(): PackResult {
  const output = run("npm", ["pack", "--dry-run", "--json", "--cache", NPM_CACHE], { capture: true });
  const result = parsePackOutput(output);

  printPackageContents(result);
  verifyPackageContents(result.files ?? []);

  return result;
}

async function confirmPublish(packageName: string, version: string, options: Options): Promise<void> {
  if (options.yes) {
    return;
  }

  const readline = createInterface({ input, output });

  try {
    const answer = await readline.question(
      `Publish ${packageName}@${version} to npm with dist-tag "next"? Type "publish" to continue: `,
    );

    if (answer.trim() !== "publish") {
      throw new Error("Publish cancelled.");
    }
  } finally {
    readline.close();
  }
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const originalPackageJson = readFileSync(PACKAGE_JSON, "utf8");
  const currentPackageJson = readPackageJson();

  const version = await calculateVersion(currentPackageJson.version);
  console.log(`gitversionjs version: ${version.rawVersion}`);
  console.log(`current package version: ${currentPackageJson.version}`);
  console.log(`npm prerelease version: ${version.npmVersion}`);

  if (options.versionOnly) {
    return;
  }

  verifyCleanGitTree(options);

  try {
    const previousVersion = updatePackageVersion(version.npmVersion);
    console.log(`Updated package.json version: ${previousVersion} -> ${version.npmVersion}`);

    run("npm", ["run", "clean"]);
    run("npm", ["run", "build"]);
    run("npm", ["run", "test:emulator"]);

    const packResult = packDryRun();
    console.log("Package contents check passed.");

    if (options.dryRun) {
      console.log("Dry run complete. No npm publish was performed.");
      return;
    }

    const packageJson = readPackageJson();
    await confirmPublish(packageJson.name, packageJson.version, options);

    run("npm", ["publish", "--access", "public", "--tag", "next", "--cache", NPM_CACHE]);
    console.log(`Published ${packResult.name ?? packageJson.name}@${packResult.version ?? packageJson.version} with dist-tag "next".`);
  } finally {
    if (options.dryRun) {
      writeFileSync(PACKAGE_JSON, originalPackageJson);
    }
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Publish failed: ${message}`);
  process.exitCode = 1;
});
