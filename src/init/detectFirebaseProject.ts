import { existsSync, readFileSync } from "node:fs";

export interface FirebaseProjectCandidate {
  projectId: string;
  source: string;
  key: string;
}

const projectConfigFiles = [
  ".env",
  ".env.local",
  ".env.development",
  ".env.production",
  "firebase.json",
  "src/firebase.ts",
  "src/firebase.js",
  "firebase.ts",
  "firebase.js",
  "src/lib/firebase.ts",
  "src/lib/firebase.js",
  "app/firebase.ts",
  "app/firebase.js",
];

const projectKeys = [
  "VITE_FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "REACT_APP_FIREBASE_PROJECT_ID",
  "FIREBASE_PROJECT_ID",
  "GCLOUD_PROJECT",
  "projectId",
  "project_id",
];

function stripQuotes(value: string): string {
  return value.trim().replace(/^["']|["']$/g, "");
}

function findKeyValue(content: string, key: string): string[] {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`(?:^|\\n)\\s*${escapedKey}\\s*=\\s*["']?([^"'\\n#]+)["']?`, "g"),
    new RegExp(`${escapedKey}\\s*[:=]\\s*["']([^"']+)["']`, "g"),
  ];
  const values: string[] = [];

  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) {
      const value = stripQuotes(match[1] ?? "");

      if (value !== "") {
        values.push(value);
      }
    }
  }

  return values;
}

export function detectFirebaseProjectCandidates(): FirebaseProjectCandidate[] {
  const candidates: FirebaseProjectCandidate[] = [];
  const seen = new Set<string>();

  for (const filePath of projectConfigFiles) {
    if (!existsSync(filePath)) {
      continue;
    }

    let content: string;

    try {
      content = readFileSync(filePath, "utf-8");
    } catch {
      continue;
    }

    for (const key of projectKeys) {
      for (const projectId of findKeyValue(content, key)) {
        const dedupeKey = `${projectId}\0${filePath}\0${key}`;

        if (seen.has(dedupeKey)) {
          continue;
        }

        seen.add(dedupeKey);
        candidates.push({
          projectId,
          source: filePath,
          key,
        });
      }
    }
  }

  return candidates;
}

export function uniqueProjectIds(candidates: FirebaseProjectCandidate[]): string[] {
  return [...new Set(candidates.map((candidate) => candidate.projectId))];
}
