import { initializeApp, getApps, getApp } from "firebase/app";
import { 
  initializeAuth, 
  indexedDBLocalPersistence, 
  browserLocalPersistence, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signInWithRedirect 
} from "firebase/auth";
import { getDatabase, ref, update } from "firebase/database";
import { getMessaging, isSupported, getToken, onMessage } from "firebase/messaging";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL
};

// Check config
if (!firebaseConfig.apiKey) {
  console.error("CRITICAL: Firebase API Key missing.");
}

// Singleton init
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// 1. Explicit Persistence
// 'browserLocalPersistence' is crucial for iOS PWA survival across reloads/redirects
export const auth = initializeAuth(app, {
  persistence: [indexedDBLocalPersistence, browserLocalPersistence]
});

export const db = getDatabase(app);
export const googleProvider = new GoogleAuthProvider();

export const messaging = async () => {
  try {
    const supported = await isSupported();
    return supported ? getMessaging(app) : null;
  } catch (err) {
    console.warn("Firebase Messaging not supported.", err);
    return null;
  }
};

// --- Helpers ---

export const loginWithGoogle = async () => {
  console.log("[Auth] loginWithGoogle triggered.");
  try {
    const isIOSStandalone = (window.navigator as any).standalone === true;
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || isIOSStandalone;
    
    console.log("[Auth] Environment:", { isStandalone, isIOSStandalone });

    if (isStandalone) {
      console.log("[Auth] Using signInWithRedirect (Standalone Mode)");
      await signInWithRedirect(auth, googleProvider);
      return null;
    } else {
      console.log("[Auth] Using signInWithPopup (Browser Mode)");
      const result = await signInWithPopup(auth, googleProvider);
      return result.user;
    }
  } catch (error) {
    console.error("[Auth] Login Error:", error);
    throw error;
  }
};

export const updateUserProfile = async (uid: string, data: any) => {
  const userRef = ref(db, `users/${uid}`);
  await update(userRef, data);
};

export const requestNotificationPermission = async (uid: string) => {
  try {
    const msg = await messaging();
    if (!msg) return null;

    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
      const token = await getToken(msg, { vapidKey });
      if (token) {
        await updateUserProfile(uid, { fcmToken: token });
        return token;
      }
    }
  } catch (error) {
    console.error('Error requesting notification permission:', error);
  }
  return null;
};

export const onMessageListener = () =>
  new Promise(async (resolve) => {
    const msg = await messaging();
    if (!msg) return;
    onMessage(msg, (payload) => {
      resolve(payload);
    });
  });