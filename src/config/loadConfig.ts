import { readFileSync } from "node:fs";

export interface FirevaultConfig {
  projectId: string;
  serviceAccountPath: string;
  outputDir: string;
  collections: string[];
}

export function loadConfig(): FirevaultConfig {
  const raw = readFileSync("firevault.config.json", "utf-8");

  return JSON.parse(raw) as FirevaultConfig;
}
