import { existsSync, readFileSync } from "node:fs";

export interface FirevaultConfig {
  projectId: string;
  serviceAccountPath: string;
  outputDir: string;
  collections: string[];
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
  field: keyof FirevaultConfig,
): string {
  const value = config[field];

  if (typeof value !== "string" || value.trim() === "") {
    throw new ConfigError(
      `Invalid firevault.config.json: "${field}" is required and must be a string.`,
    );
  }

  return value;
}

function requireStringArray(
  config: Record<string, unknown>,
  field: keyof FirevaultConfig,
): string[] {
  const value = config[field];

  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.some((item) => typeof item !== "string" || item.trim() === "")
  ) {
    throw new ConfigError(
      `Invalid firevault.config.json: "${field}" is required and must include at least one collection name.`,
    );
  }

  return value;
}

export function loadConfig(): FirevaultConfig {
  const configPath = "firevault.config.json";

  if (!existsSync(configPath)) {
    throw new ConfigError(
      "Missing firevault.config.json. Run `firevault init` first.",
    );
  }

  let parsed: unknown;

  try {
    const raw = readFileSync(configPath, "utf-8");
    parsed = JSON.parse(raw);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new ConfigError(
        "Invalid firevault.config.json: file is not valid JSON.",
      );
    }

    throw error;
  }

  if (!isRecord(parsed)) {
    throw new ConfigError("Invalid firevault.config.json: expected a JSON object.");
  }

  const config = {
    projectId: requireString(parsed, "projectId"),
    serviceAccountPath: requireString(parsed, "serviceAccountPath"),
    outputDir: requireString(parsed, "outputDir"),
    collections: requireStringArray(parsed, "collections"),
  };

  if (!existsSync(config.serviceAccountPath)) {
    throw new ConfigError(
      `Service account file not found: ${config.serviceAccountPath}`,
    );
  }

  return config;
}
