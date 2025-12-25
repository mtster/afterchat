/// <reference types="vite/client" />

// Configuration Constants
// IMPORTANT: In Vite, we use import.meta.env.VITE_...
// Ensure these are set in your .env file locally and Vercel Environment Variables for production.

export const FIREBASE_CONFIG = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DB_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// VAPID Key from Firebase Console
export const VAPID_KEY = "YOUR_VAPID_PUBLIC_KEY_HERE";