import admin from "firebase-admin";
import { existsSync, readFileSync } from "node:fs";

export async function listFirestoreCollections(
  projectId: string,
  serviceAccountPath: string,
): Promise<string[]> {
  if (!existsSync(serviceAccountPath)) {
    throw new Error(`Service account file not found: ${serviceAccountPath}`);
  }

  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
  let appOptions: admin.AppOptions;

  if (emulatorHost) {
    appOptions = { projectId };
  } else {
    let serviceAccount: admin.ServiceAccount;

    try {
      serviceAccount = JSON.parse(
        readFileSync(serviceAccountPath, "utf-8"),
      ) as admin.ServiceAccount;
    } catch {
      throw new Error(`Invalid service account file: ${serviceAccountPath}`);
    }

    appOptions = {
      credential: admin.credential.cert(serviceAccount),
      projectId,
    };
  }

  const app = admin.initializeApp(
    appOptions,
    `firevault-init-${Date.now()}`,
  );

  try {
    const collections = await app.firestore().listCollections();
    return collections.map((collection) => collection.id).sort();
  } finally {
    await app.delete();
  }
}
