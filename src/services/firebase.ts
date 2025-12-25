import { initializeApp } from "firebase/app";
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

// Safety check to log error if variables are missing
if (!firebaseConfig.apiKey) {
  console.error("CRITICAL: Firebase API Key is missing from environment variables.");
}

const app = initializeApp(firebaseConfig);

// 1. Standardize Authentication Initialization with Persistence
// Including browserLocalPersistence ensures fallback for environments where IndexedDB is flaky (like some iOS PWA contexts)
export const auth = initializeAuth(app, {
  persistence: [indexedDBLocalPersistence, browserLocalPersistence]
});

export const db = getDatabase(app);
export const googleProvider = new GoogleAuthProvider();

// Safe messaging initialization (Async to check support)
export const messaging = async () => {
  try {
    const supported = await isSupported();
    return supported ? getMessaging(app) : null;
  } catch (err) {
    console.warn("Firebase Messaging not supported in this environment.", err);
    return null;
  }
};

// --- Auth Helper Functions ---

export const loginWithGoogle = async () => {
  console.log("loginWithGoogle triggered.");
  try {
    // Check if running in standalone mode (PWA installed)
    const isIOSStandalone = (window.navigator as any).standalone === true;
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || isIOSStandalone;
    
    console.log("Environment Detection:", {
        isIOSStandalone,
        matchMediaStandalone: window.matchMedia('(display-mode: standalone)').matches,
        finalIsStandalone: isStandalone
    });

    if (isStandalone) {
      // iOS PWA often blocks popups or they disappear when app minimizes. Use Redirect.
      console.log("Attempting signInWithRedirect...");
      await signInWithRedirect(auth, googleProvider);
      console.log("signInWithRedirect called. Page should redirect now.");
      // Return null as we are redirecting away. The result is handled in App.tsx via getRedirectResult.
      return null;
    } else {
      // Browser mode - Popup is smoother and doesn't reload the page
      console.log("Attempting signInWithPopup...");
      const result = await signInWithPopup(auth, googleProvider);
      console.log("signInWithPopup successful:", result.user.uid);
      return result.user;
    }
  } catch (error) {
    console.error("Google Login Error:", error);
    throw error;
  }
};

// --- Database & Messaging Helper Functions ---

export const updateUserProfile = async (uid: string, data: any) => {
  const userRef = ref(db, `users/${uid}`);
  await update(userRef, data);
};

export const requestNotificationPermission = async (uid: string) => {
  try {
    const msg = await messaging();
    if (!msg) {
        console.log("Messaging not supported.");
        return null;
    }

    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
      if (!vapidKey) console.warn("VITE_FIREBASE_VAPID_KEY is missing.");

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