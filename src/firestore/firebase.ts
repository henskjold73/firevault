import admin from "firebase-admin";
import { readFileSync } from "node:fs";
import { loadConfig } from "../config/loadConfig.js";

let initialized = false;

export function getFirestore() {
  if (!initialized) {
    const config = loadConfig();

    const serviceAccount = JSON.parse(
      readFileSync(config.serviceAccountPath, "utf-8"),
    );

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });

    initialized = true;
  }

  return admin.firestore();
}
