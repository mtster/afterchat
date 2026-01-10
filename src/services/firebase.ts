
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
import { getMessaging, isSupported, getToken, onMessage, MessagePayload } from "firebase/messaging";
import { UserProfile, Roomer } from "../types";

export const VAPID_KEY = "YOUR_VAPID_KEY_HERE"; 

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: typeof window !== 'undefined' ? window.location.hostname : "afterchat.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL
};

export const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);
export const db = getDatabase(app);
export const googleProvider = new GoogleAuthProvider();

// Helper to sign in with email/password
export const signInWithEmail = (email: string, pass: string) => signInWithEmailAndPassword(auth, email, pass);

// Helper to create account with email/password
export const signUpWithEmail = (email: string, pass: string) => createUserWithEmailAndPassword(auth, email, pass);

export const messaging = async () => {
  try {
    const supported = await isSupported();
    return supported ? getMessaging(app) : null;
  } catch (err) {
    return null;
  }
};

export const requestAndStoreToken = async (uid: string) => {
  try {
    if (typeof window === 'undefined' || !('Notification' in window)) return;

    const msg = await messaging();
    if (!msg) return;

    // Check existing permission to avoid false-negative logs on startup
    if (Notification.permission === 'denied') {
        console.log("[FCM] Permission was previously denied by user.");
        return;
    }

    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
        const currentVapidKey = VAPID_KEY !== "YOUR_VAPID_KEY_HERE" ? VAPID_KEY : import.meta.env.VITE_FIREBASE_VAPID_KEY;
        const token = await getToken(msg, { vapidKey: currentVapidKey });

        if (token) {
            console.log("FCM Token Generated:", token);
            await update(ref(db, `roomers/${uid}`), { fcmToken: token });
        }
    }
  } catch (e) {
      // Silence noisy errors during startup persistence checks
  }
};

// Exported alias for setupNotifications used in RoomsList component
export const setupNotifications = (uid: string) => requestAndStoreToken(uid);

export const onMessageListener = async (callback: (payload: MessagePayload) => void) => {
  const msg = await messaging();
  if (msg) {
    onMessage(msg, (payload) => callback(payload));
  }
};

export const updateUserProfile = async (uid: string, data: Partial<UserProfile>) => {
  try {
    const userRef = ref(db, `roomers/${uid}`);
    await update(userRef, data);
  } catch (e) {
    console.error("Failed to update user profile", e);
    throw e;
  }
};

export const getUserProfile = async (uid: string): Promise<UserProfile | null> => {
  try {
    const snapshot = await get(child(ref(db), `roomers/${uid}`));
    if (snapshot.exists()) {
      return snapshot.val() as UserProfile;
    }
    return null;
  } catch (e) {
    return null;
  }
};

export const findUserByEmailOrUsername = async (searchTerm: string): Promise<Roomer | null> => {
  const roomersRef = ref(db, 'roomers');
  let cleanTerm = searchTerm.trim();
  
  let q = query(roomersRef, orderByChild('email'), equalTo(cleanTerm));
  let snapshot = await get(q);
  
  if (!snapshot.exists()) {
    if (!cleanTerm.includes('@') && !cleanTerm.startsWith('$')) {
        cleanTerm = '$' + cleanTerm;
    }
    q = query(roomersRef, orderByChild('username'), equalTo(cleanTerm));
    snapshot = await get(q);
    
    if (!snapshot.exists() && cleanTerm.startsWith('$')) {
        const namePart = cleanTerm.substring(1);
        const capitalized = '$' + namePart.charAt(0).toUpperCase() + namePart.slice(1);
        q = query(roomersRef, orderByChild('username'), equalTo(capitalized));
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

export const addRoomerToUser = async (currentUid: string, targetUid: string) => {
  await update(ref(db, `roomers/${currentUid}/addedRoomers`), {
    [targetUid]: 'pending'
  });
  await update(ref(db, `roomers/${targetUid}/pendingApprovals`), {
    [currentUid]: true
  });
};

export const approveRoomer = async (currentUid: string, targetUid: string) => {
    const myUpdates = {
        [`pendingApprovals/${targetUid}`]: null,
        [`addedRoomers/${targetUid}`]: 'accepted'
    };
    await update(ref(db, `roomers/${currentUid}`), myUpdates);
    await update(ref(db, `roomers/${targetUid}/addedRoomers`), {
        [currentUid]: 'accepted'
    });
};

export const deleteRoomer = async (currentUid: string, targetUid: string) => {
    const myUpdates = {
        [`addedRoomers/${targetUid}`]: null,
        [`pendingApprovals/${targetUid}`]: null
    };
    await update(ref(db, `roomers/${currentUid}`), myUpdates);

    const theirUpdates = {
        [`addedRoomers/${currentUid}`]: null,
        [`pendingApprovals/${currentUid}`]: null
    };
    await update(ref(db, `roomers/${targetUid}/addedRoomers`), { [currentUid]: null });
    await update(ref(db, `roomers/${targetUid}/pendingApprovals`), { [currentUid]: null });
};

export const getRoomerDetails = async (uid: string, status: Roomer['status']): Promise<Roomer | null> => {
  const snapshot = await get(child(ref(db), `roomers/${uid}`));
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
