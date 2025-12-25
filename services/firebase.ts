import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getDatabase, ref, update } from 'firebase/database';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import { FIREBASE_CONFIG, VAPID_KEY } from '../constants';

// 1. Validate Configuration
// We filter out undefined values to see if the object is malformed
const validConfig = Object.values(FIREBASE_CONFIG).every(value => value !== undefined && value !== '');

if (!validConfig) {
  console.error("CRITICAL ERROR: Firebase Configuration is missing keys.");
  console.table(FIREBASE_CONFIG);
  // We throw here so the ErrorBoundary in index.tsx catches it and displays the red screen
  throw new Error("Firebase Configuration Missing. Check your .env file or Vercel Environment Variables.");
}

// 2. Initialize App (Singleton Pattern)
// Prevents double-initialization in React Strict Mode
const app = !getApps().length ? initializeApp(FIREBASE_CONFIG) : getApp();

// 3. Export Services
export const auth = getAuth(app);
export const db = getDatabase(app);
export const googleProvider = new GoogleAuthProvider();

// 4. Messaging (Handle environment support safely)
let messagingInstance: any = null;
try {
  if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
    messagingInstance = getMessaging(app);
  }
} catch (err) {
  console.warn('Firebase Messaging not supported in this environment:', err);
}

export const messaging = messagingInstance;

// 5. Helper Functions

export const updateUserProfile = async (uid: string, data: any) => {
  const userRef = ref(db, `users/${uid}`);
  await update(userRef, data);
};

export const requestNotificationPermission = async (uid: string) => {
  if (!messaging) return null;
  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      const token = await getToken(messaging, { vapidKey: VAPID_KEY });
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
  new Promise((resolve) => {
    if (!messaging) return;
    onMessage(messaging, (payload) => {
      resolve(payload);
    });
  });