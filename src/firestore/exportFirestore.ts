import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getFirestore } from "./firebase.js";
import { stableStringify } from "./stableStringify.js";

export async function exportCollection(
  outputDir: string,
  collectionName: string,
) {
  const db = getFirestore();

  const snapshot = await db.collection(collectionName).get();

  const collectionDir = path.join(outputDir, collectionName);

  mkdirSync(collectionDir, { recursive: true });

  for (const doc of snapshot.docs) {
    const filePath = path.join(collectionDir, `${doc.id}.json`);

    writeFileSync(filePath, stableStringify(doc.data()));
  }

  console.log(`Exported ${snapshot.docs.length} docs from ${collectionName}`);
}
