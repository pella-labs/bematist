import "server-only";
import { readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function getServiceAccount(): Record<string, string> | null {
  // Prefer stringified JSON env var; fall back to file path. Local dev
  // typically uses the path (no escaping headaches); prod/Vercel uses the
  // stringified JSON pasted into the dashboard.
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    } catch (err) {
      console.error(
        "[firebase/admin] FIREBASE_SERVICE_ACCOUNT present but not valid JSON:",
        (err as Error).message,
      );
    }
  }
  const path =
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (path) {
    const abs = isAbsolute(path) ? path : resolve(process.cwd(), path);
    try {
      return JSON.parse(readFileSync(abs, "utf8"));
    } catch (err) {
      console.error(
        `[firebase/admin] failed to read service account at ${abs}:`,
        (err as Error).message,
      );
    }
  }
  return null;
}

const serviceAccount = getServiceAccount();

const existing = getApps()[0];
const app = existing
  ? existing
  : serviceAccount
    ? initializeApp({ credential: cert(serviceAccount) })
    : initializeApp();

export const adminAuth = getAuth(app);
export const db = getFirestore(app);
export const firebaseConfigured = serviceAccount !== null;
