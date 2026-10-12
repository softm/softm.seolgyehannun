import { initializeApp, type FirebaseApp } from "firebase/app";
import {
  connectAuthEmulator,
  getAuth,
  type Auth,
} from "firebase/auth";
import {
  clearIndexedDbPersistence,
  connectFirestoreEmulator,
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager,
  terminate,
  type Firestore,
} from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions, type Functions } from "firebase/functions";
import { connectStorageEmulator, getStorage, type FirebaseStorage } from "firebase/storage";
import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
  type AppCheck,
} from "firebase/app-check";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

export const firebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId,
);

export const trustedCachePreferenceKey = "seolgye-hannun.trusted-device-cache";

export interface FirebaseServices {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  storage: FirebaseStorage;
  functions: Functions;
  appCheck?: AppCheck;
}

let cachedServices: FirebaseServices | null = null;
let emulatorConnected = false;

export function getFirebaseServices(): FirebaseServices | null {
  if (!firebaseConfigured) return null;
  if (cachedServices) return cachedServices;

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const trustedCache = localStorage.getItem(trustedCachePreferenceKey) === "enabled";
  const db = initializeFirestore(app, {
    ignoreUndefinedProperties: true,
    localCache: trustedCache
      ? persistentLocalCache({ tabManager: persistentMultipleTabManager() })
      : memoryLocalCache(),
  });
  const storage = getStorage(app);
  const functions = getFunctions(app, "asia-northeast3");
  const siteKey = import.meta.env.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY;
  const appCheck = siteKey
    ? initializeAppCheck(app, {
        provider: new ReCaptchaEnterpriseProvider(siteKey),
        isTokenAutoRefreshEnabled: true,
      })
    : undefined;

  if (import.meta.env.VITE_USE_FIREBASE_EMULATORS === "true" && !emulatorConnected) {
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
    connectStorageEmulator(storage, "127.0.0.1", 9199);
    connectFunctionsEmulator(functions, "127.0.0.1", 5001);
    emulatorConnected = true;
  }

  cachedServices = { app, auth, db, storage, functions, appCheck };
  return cachedServices;
}

export function setTrustedDeviceCache(enabled: boolean): void {
  if (enabled) localStorage.setItem(trustedCachePreferenceKey, "enabled");
  else localStorage.removeItem(trustedCachePreferenceKey);
}

export function isTrustedDeviceCacheEnabled(): boolean {
  return localStorage.getItem(trustedCachePreferenceKey) === "enabled";
}

export async function clearTrustedDeviceCache(): Promise<void> {
  localStorage.removeItem(trustedCachePreferenceKey);
  const services = cachedServices;
  if (!services) return;
  await terminate(services.db);
  await clearIndexedDbPersistence(services.db);
  cachedServices = null;
}
