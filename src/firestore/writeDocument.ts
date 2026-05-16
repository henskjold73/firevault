import { getFirestore } from "./firebase.js";

export class FirestoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FirestoreError";
  }
}

export async function writeDocument(
  collection: string,
  documentId: string,
  data: Record<string, unknown>,
): Promise<void> {
  try {
    const db = getFirestore();

    await db.collection(collection).doc(documentId).set(data);
  } catch (error) {
    if (error instanceof FirestoreError) {
      throw error;
    }

    if (error instanceof Error) {
      throw new FirestoreError(
        `Failed to write Firestore document ${collection}/${documentId}: ${error.message}`,
      );
    }

    throw new FirestoreError(
      `Failed to write Firestore document ${collection}/${documentId}.`,
    );
  }
}
