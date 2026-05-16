import admin from "firebase-admin";
import { readFileSync } from "node:fs";
import { ConfigError, loadConfig } from "../config/loadConfig.js";

let initialized = false;

export function getFirestore() {
  if (!initialized) {
    const config = loadConfig();
    let serviceAccount: admin.ServiceAccount;

    try {
      serviceAccount = JSON.parse(
        readFileSync(config.serviceAccountPath, "utf-8"),
      ) as admin.ServiceAccount;

      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: config.projectId,
      });
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new ConfigError(
          `Invalid service account file: ${config.serviceAccountPath}`,
        );
      }

      if (error instanceof Error && error.message.includes("Failed to parse")) {
        throw new ConfigError(
          `Invalid service account file: ${config.serviceAccountPath}`,
        );
      }

      throw error;
    }

    initialized = true;
  }

  return admin.firestore();
}
