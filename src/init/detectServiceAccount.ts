import { existsSync } from "node:fs";

const likelyServiceAccountPaths = [
  "./serviceAccountKey.json",
  "./service-account.json",
  "./firebase-service-account.json",
  "./credentials/firebase.json",
];

export function detectServiceAccountPaths(): string[] {
  return likelyServiceAccountPaths.filter((filePath) => existsSync(filePath));
}
