import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getDatabase, ref, set, push, onValue, update, get } from 'firebase/database';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import { FIREBASE_CONFIG, VAPID_KEY } from '../constants';

const env = (import.meta as any).env || {};

// --- DEBUGGING START ---
// This will print to your browser console (F12)
console.log("Firebase Config Check:", {
  apiKey: env.VITE_FIREBASE_API_KEY ? "Loaded (Exists)" : "MISSING",
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN ? "Loaded (Exists)" : "MISSING",
  projectId: env.VITE_FIREBASE_PROJECT_ID ? "Loaded (Exists)" : "MISSING",
  fullConfig: FIREBASE_CONFIG // Inspect this object in console to see if values are undefined
});

if (!FIREBASE_CONFIG.apiKey) {
  console.error("CRITICAL: Firebase API Key is missing. Check your .env file or Vercel Environment Variables.");
}
// --- DEBUGGING END ---

const app = initializeApp(FIREBASE_CONFIG);
export const auth = getAuth(app);
export const db = getDatabase(app);
export const googleProvider = new GoogleAuthProvider();

// Messaging is supported
let messaging: any = null;
try {
  messaging = getMessaging(app);
} catch (error) {
  console.log('Firebase messaging not supported (safely skipped for non-supported envs)');
}

// --- Realtime Database Helpers ---

export const updateUserProfile = async (uid: string, data: Partial<any>) => {
  const userRef = ref(db, `users/${uid}`);
  await update(userRef, data);
};

export const saveFCMToken = async (uid: string, token: string) => {
  const tokenRef = ref(db, `users/${uid}/fcmToken`);
  await set(tokenRef, token);
};

// --- Messaging Helpers ---

export const requestNotificationPermission = async (uid: string): Promise<string | null> => {
  if (!messaging) return null;
  
  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      const token = await getToken(messaging, { vapidKey: VAPID_KEY });
      if (token) {
        await saveFCMToken(uid, token);
        return token;
      }
    }
  } catch (error) {
    console.error("An error occurred while retrieving token. ", error);
  }
  return null;
};

export const onMessageListener = () => {
  if (!messaging) return new Promise(() => {});
  return new Promise((resolve) => {
    onMessage(messaging, (payload) => {
      resolve(payload);
    });
  });
};