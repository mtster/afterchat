// Configuration Constants
// IMPORTANT: In Vite, we use import.meta.env.VITE_...
// Ensure these are set in your .env file locally and Vercel Environment Variables for production.

// Cast import.meta to any to avoid "Property 'env' does not exist on type 'ImportMeta'" errors
// and "Cannot find type definition file for 'vite/client'"
const env = (import.meta as any).env || {};

export const FIREBASE_CONFIG = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: env.VITE_FIREBASE_DB_URL,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};

// VAPID Key from Firebase Console
export const VAPID_KEY = "YOUR_VAPID_PUBLIC_KEY_HERE";