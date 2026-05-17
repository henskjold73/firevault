import { existsSync } from "node:fs";
import path from "node:path";

const likelyServiceAccountPaths = [
  "./serviceAccountKey.json",
  "./service-account.json",
  "./firebase-service-account.json",
  "./credentials/firebase.json",
];

function normalizeConfigRelativePath(filePath: string): string {
  const normalized = filePath.replaceAll("\\", "/");

  if (normalized.startsWith("../")) {
    return normalized;
  }

  return normalized.startsWith("./") ? normalized : `./${normalized}`;
}

export function detectServiceAccountPaths(
  appRoot = process.cwd(),
  workspaceRoot = path.join(appRoot, ".firevault"),
): string[] {
  const candidates: string[] = [];

  for (const filePath of likelyServiceAccountPaths) {
    const appPath = path.resolve(appRoot, filePath);
    const workspacePath = path.resolve(workspaceRoot, filePath);

    if (existsSync(workspacePath)) {
      candidates.push(normalizeConfigRelativePath(filePath));
    }

    if (existsSync(appPath)) {
      candidates.push(
        normalizeConfigRelativePath(path.relative(workspaceRoot, appPath)),
      );
    }
  }

  return [...new Set(candidates)];
}
