import { initializeApp, getApps, getApp } from "firebase/app";
import { 
  getAuth, 
  GoogleAuthProvider,
  setPersistence,
  browserLocalPersistence,
  indexedDBLocalPersistence
} from "firebase/auth";
import { getDatabase, ref, update } from "firebase/database";
import { getMessaging, isSupported } from "firebase/messaging";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL
};

// Singleton init
export const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Initialize Auth
export const auth = getAuth(app);

// Initialize Database
export const db = getDatabase(app);

// Initialize Provider
export const googleProvider = new GoogleAuthProvider();

// Initialize Messaging (Async)
export const messaging = async () => {
  try {
    const supported = await isSupported();
    return supported ? getMessaging(app) : null;
  } catch (err) {
    console.warn("Firebase Messaging not supported.", err);
    return null;
  }
};

// Helper to set persistence immediately
// This helps prevent 'Split Brain' issues on iOS/PWA refreshes
setPersistence(auth, browserLocalPersistence)
  .then(() => {
    console.log("Firebase Persistence set to browserLocalPersistence");
  })
  .catch((error) => {
    console.error("Firebase Persistence Error:", error);
  });

// --- User Profile Helper ---
export const updateUserProfile = async (uid: string, data: any) => {
  try {
    const userRef = ref(db, `users/${uid}`);
    await update(userRef, data);
    console.log("User profile updated in DB");
  } catch (e) {
    console.error("Failed to update user profile", e);
  }
};