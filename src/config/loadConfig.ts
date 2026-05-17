import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export interface FirevaultConfig {
  projectId: string;
  serviceAccountPath: string;
  serviceAccountPathAbsolute: string;
  outputDir: string;
  outputDirPath: string;
  collections: string[];
  workspaceRoot: string;
  configPath: string;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireString(
  config: Record<string, unknown>,
  field: "projectId" | "serviceAccountPath" | "outputDir",
): string {
  const value = config[field];

  if (typeof value !== "string" || value.trim() === "") {
    throw new ConfigError(
      `Invalid .firevault/config.json: "${field}" is required and must be a string.`,
    );
  }

  return value;
}

function requireStringArray(
  config: Record<string, unknown>,
  field: "collections",
): string[] {
  const value = config[field];

  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.some((item) => typeof item !== "string" || item.trim() === "")
  ) {
    throw new ConfigError(
      `Invalid .firevault/config.json: "${field}" is required and must include at least one collection name.`,
    );
  }

  return value;
}

export function findWorkspaceRoot(startDir = process.cwd()): string | undefined {
  let currentDir = path.resolve(startDir);

  while (true) {
    const candidate = path.join(currentDir, ".firevault", "config.json");

    if (existsSync(candidate)) {
      return path.join(currentDir, ".firevault");
    }

    const parent = path.dirname(currentDir);

    if (parent === currentDir) {
      return undefined;
    }

    currentDir = parent;
  }
}

function normalizeConfigPath(value: string): string {
  return value.replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/+$/, "");
}

export function resolveWorkspacePath(workspaceRoot: string, configPath: string): string {
  return path.resolve(workspaceRoot, configPath);
}

export function loadConfig(): FirevaultConfig {
  const workspaceRoot = findWorkspaceRoot();

  if (!workspaceRoot) {
    throw new ConfigError(
      "Missing .firevault/config.json. Run `firevault init` first.",
    );
  }

  const configPath = path.join(workspaceRoot, "config.json");

  let parsed: unknown;

  try {
    const raw = readFileSync(configPath, "utf-8");
    parsed = JSON.parse(raw);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new ConfigError(
        "Invalid .firevault/config.json: file is not valid JSON.",
      );
    }

    throw error;
  }

  if (!isRecord(parsed)) {
    throw new ConfigError("Invalid .firevault/config.json: expected a JSON object.");
  }

  const config = {
    projectId: requireString(parsed, "projectId"),
    serviceAccountPath: normalizeConfigPath(requireString(parsed, "serviceAccountPath")),
    outputDir: normalizeConfigPath(requireString(parsed, "outputDir")),
    collections: requireStringArray(parsed, "collections"),
    workspaceRoot,
    configPath,
    serviceAccountPathAbsolute: "",
    outputDirPath: "",
  };

  config.serviceAccountPathAbsolute = resolveWorkspacePath(
    workspaceRoot,
    config.serviceAccountPath,
  );
  config.outputDirPath = resolveWorkspacePath(workspaceRoot, config.outputDir);

  return config;
}
