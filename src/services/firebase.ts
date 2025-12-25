import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup } from "firebase/auth";
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
export const auth = getAuth(app);
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
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
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