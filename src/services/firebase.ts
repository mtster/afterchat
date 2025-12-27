import { initializeApp, getApps, getApp } from "firebase/app";
import { 
  getAuth, 
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
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
import { getMessaging, isSupported, getToken } from "firebase/messaging";
import { UserProfile, Roomer } from "../types";

// --- CONFIGURATION ---
// PASTE YOUR VAPID KEY HERE (From Project Settings > Cloud Messaging > Web Push certs)
export const VAPID_KEY = "YOUR_VAPID_KEY_HERE"; 

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  // Proxy through Vercel to avoid 3rd party cookie blocking on iOS PWA
  authDomain: typeof window !== 'undefined' ? window.location.hostname : "afterchat.firebaseapp.com",
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

// PWA Config
googleProvider.setCustomParameters({
  prompt: 'select_account'
});

export const messaging = async () => {
  try {
    const supported = await isSupported();
    return supported ? getMessaging(app) : null;
  } catch (err) {
    console.warn("Firebase Messaging not supported.", err);
    return null;
  }
};

// --- Notifications ---

export const requestAndStoreToken = async (uid: string) => {
  try {
    const msg = await messaging();
    if (!msg) {
        console.log("Messaging not supported.");
        return;
    }

    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
        // We use the exported constant or env var fallback
        const currentVapidKey = VAPID_KEY !== "YOUR_VAPID_KEY_HERE" 
            ? VAPID_KEY 
            : import.meta.env.VITE_FIREBASE_VAPID_KEY;

        if (!currentVapidKey) {
            console.warn("VAPID KEY is missing. Notifications will not work.");
            return;
        }

        const token = await getToken(msg, {
            vapidKey: currentVapidKey
        });

        if (token) {
            console.log("FCM Token Generated:", token);
            await update(ref(db, `users/${uid}`), { fcmToken: token });
        } else {
            console.log("No registration token available. Request permission to generate one.");
        }
    } else {
        console.log("Notification permission denied.");
    }
  } catch (e) {
      console.error("Notification permission/token error", e);
  }
};

export const setupNotifications = requestAndStoreToken;

// --- Auth Helpers ---

export const signInWithEmail = (email: string, pass: string) => signInWithEmailAndPassword(auth, email, pass);
export const signUpWithEmail = (email: string, pass: string) => createUserWithEmailAndPassword(auth, email, pass);

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

export const getUserProfile = async (uid: string): Promise<UserProfile | null> => {
  try {
    const snapshot = await get(child(ref(db), `users/${uid}`));
    if (snapshot.exists()) {
      return snapshot.val() as UserProfile;
    }
    return null;
  } catch (e) {
    console.error("Failed to fetch user profile", e);
    return null;
  }
};

// SEARCH LOGIC (Case-insensitive approximation)
export const findUserByEmailOrUsername = async (searchTerm: string): Promise<Roomer | null> => {
  const usersRef = ref(db, 'users');
  let cleanTerm = searchTerm.trim();
  
  // 1. Try Email (Exact)
  let q = query(usersRef, orderByChild('email'), equalTo(cleanTerm));
  let snapshot = await get(q);
  
  // 2. Try Username (Exact)
  if (!snapshot.exists()) {
     // Ensure $ prefix if not present for username search
    if (!cleanTerm.includes('@') && !cleanTerm.startsWith('$')) {
        cleanTerm = '$' + cleanTerm;
    }

    // Try exact match first
    q = query(usersRef, orderByChild('username'), equalTo(cleanTerm));
    snapshot = await get(q);
    
    // 3. Forgiving Search (Try to match lowercase/capitalization variations if simple match fails)
    if (!snapshot.exists() && cleanTerm.startsWith('$')) {
        const namePart = cleanTerm.substring(1);
        const capitalized = '$' + namePart.charAt(0).toUpperCase() + namePart.slice(1);
        q = query(usersRef, orderByChild('username'), equalTo(capitalized));
        snapshot = await get(q);
    }
  }

  if (snapshot.exists()) {
    const uid = Object.keys(snapshot.val())[0];
    const userData = snapshot.val()[uid];
    return {
      uid,
      displayName: userData.displayName || 'Unknown',
      photoURL: userData.photoURL || null,
      username: userData.username || null,
      email: userData.email || null,
      status: 'accepted' 
    };
  }
  return null;
};

// --- ROOMER APPROVAL FLOW ---

// 1. ADD: User A adds User B
export const addRoomerToUser = async (currentUid: string, targetUid: string) => {
  // Update 1: My List
  await update(ref(db, `users/${currentUid}/addedUsers`), {
    [targetUid]: 'pending'
  });

  // Update 2: Their List
  await update(ref(db, `users/${targetUid}/pendingApprovals`), {
    [currentUid]: true
  });
};

// 2. APPROVE: User B accepts User A
export const approveRoomer = async (currentUid: string, targetUid: string) => {
    // 1. Update Me
    const myUpdates = {
        [`pendingApprovals/${targetUid}`]: null,
        [`addedUsers/${targetUid}`]: 'accepted'
    };
    await update(ref(db, `users/${currentUid}`), myUpdates);
    
    // 2. Update Them
    await update(ref(db, `users/${targetUid}/addedUsers`), {
        [currentUid]: 'accepted'
    });
};

// 3. REJECT / DELETE: User B rejects A, OR User A deletes B
export const deleteRoomer = async (currentUid: string, targetUid: string) => {
    // 1. Update Me
    const myUpdates = {
        [`addedUsers/${targetUid}`]: null,
        [`pendingApprovals/${targetUid}`]: null
    };
    await update(ref(db, `users/${currentUid}`), myUpdates);

    // 2. Update Them
    const theirUpdates = {
        [`addedUsers/${currentUid}`]: null,
        [`pendingApprovals/${currentUid}`]: null
    };
    await update(ref(db, `users/${targetUid}`), theirUpdates);
};

// Helper to fetch details
export const getRoomerDetails = async (uid: string, status: Roomer['status']): Promise<Roomer | null> => {
  const snapshot = await get(child(ref(db), `users/${uid}`));
  if (snapshot.exists()) {
    const val = snapshot.val();
    return {
      uid,
      displayName: val.displayName || 'Unknown',
      photoURL: val.photoURL || null,
      username: val.username || null,
      email: val.email || null,
      status
    };
  }
  return null;
};