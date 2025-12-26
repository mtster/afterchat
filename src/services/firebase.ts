import { initializeApp, getApps, getApp } from "firebase/app";
import { 
  getAuth, 
  GoogleAuthProvider,
  setPersistence,
  browserLocalPersistence
} from "firebase/auth";
import { 
  getDatabase, 
  ref, 
  update, 
  get, 
  child, 
  query, 
  orderByChild, 
  equalTo 
} from "firebase/database";
import { getMessaging, isSupported } from "firebase/messaging";
import { UserProfile, Roomer } from "../types";

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
export const auth = getAuth(app);
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

setPersistence(auth, browserLocalPersistence).catch(console.error);

// --- User Management ---

export const updateUserProfile = async (uid: string, data: Partial<UserProfile>) => {
  try {
    const userRef = ref(db, `users/${uid}`);
    await update(userRef, data);
  } catch (e) {
    console.error("Failed to update user profile", e);
    throw e;
  }
};

export const findUserByEmailOrUsername = async (searchTerm: string): Promise<Roomer | null> => {
  const usersRef = ref(db, 'users');
  
  // 1. Try Email
  let q = query(usersRef, orderByChild('email'), equalTo(searchTerm));
  let snapshot = await get(q);
  
  // 2. Try Username if email failed
  if (!snapshot.exists()) {
    q = query(usersRef, orderByChild('username'), equalTo(searchTerm));
    snapshot = await get(q);
  }

  if (snapshot.exists()) {
    const uid = Object.keys(snapshot.val())[0];
    const userData = snapshot.val()[uid];
    return {
      uid,
      displayName: userData.displayName || 'Unknown',
      photoURL: userData.photoURL || null,
      username: userData.username || null,
      email: userData.email || null
    };
  }
  return null;
};

export const addRoomerToUser = async (currentUid: string, targetUid: string) => {
  // Add targetUid to currentUid's roomers list
  const updates: any = {};
  updates[`users/${currentUid}/roomers/${targetUid}`] = true;
  // Optional: Add currentUid to targetUid's roomers list (mutual) - removing for now to keep it unidirectional like a contact book, 
  // but usually chat apps are bidirectional. Let's stick to unidirectional for simplicity of permissions.
  await update(ref(db), updates);
};

export const getRoomerDetails = async (uid: string): Promise<Roomer | null> => {
  const snapshot = await get(child(ref(db), `users/${uid}`));
  if (snapshot.exists()) {
    const val = snapshot.val();
    return {
      uid,
      displayName: val.displayName || 'Unknown',
      photoURL: val.photoURL || null,
      username: val.username || null,
      email: val.email || null
    };
  }
  return null;
};