// Configuration Constants
// IMPORTANT: Replace these with your actual Firebase project configuration

export const FIREBASE_CONFIG = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY || "AIzaSyDummyKey",
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN || "your-app.firebaseapp.com",
  databaseURL: process.env.REACT_APP_FIREBASE_DB_URL || "https://your-app.firebaseio.com",
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID || "your-app",
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET || "your-app.appspot.com",
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID || "123456789",
  appId: process.env.REACT_APP_FIREBASE_APP_ID || "1:123456789:web:abcdef",
};

// VAPID Key from Firebase Console -> Project Settings -> Cloud Messaging -> Web Configuration
export const VAPID_KEY = "YOUR_VAPID_PUBLIC_KEY_HERE";