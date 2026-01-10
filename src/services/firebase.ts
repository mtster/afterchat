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

export const signInWithEmail = (email: string, pass: string) => signInWithEmailAndPassword(auth, email, pass);
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

    if (Notification.permission === 'granted') {
        const currentVapidKey = VAPID_KEY !== "YOUR_VAPID_KEY_HERE" ? VAPID_KEY : import.meta.env.VITE_FIREBASE_VAPID_KEY;
        const token = await getToken(msg, { vapidKey: currentVapidKey });
        if (token) {
            await update(ref(db, `roomers/${uid}`), { fcmToken: token });
        }
        return;
    }

    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
        const currentVapidKey = VAPID_KEY !== "YOUR_VAPID_KEY_HERE" ? VAPID_KEY : import.meta.env.VITE_FIREBASE_VAPID_KEY;
        const token = await getToken(msg, { vapidKey: currentVapidKey });
        if (token) {
            await update(ref(db, `roomers/${uid}`), { fcmToken: token });
        }
    }
  } catch (e: any) {
      console.error("[FCM_Error]", e.message);
  }
};

export const setupNotifications = (uid: string) => requestAndStoreToken(uid);

export const onMessageListener = async (callback: (payload: MessagePayload) => void) => {
  const msg = await messaging();
  if (msg) onMessage(msg, (payload) => callback(payload));
};

export const updateUserProfile = async (uid: string, data: Partial<UserProfile>, retryCount = 0) => {
  console.log(`[Profile_Sync] Updating roomers/${uid}... (Attempt ${retryCount + 1})`);
  try {
    const userRef = ref(db, `roomers/${uid}`);
    await update(userRef, data);
    console.log("[Profile_Sync] SUCCESS");
  } catch (e: any) {
    if (e.code === 'PERMISSION_DENIED' && retryCount < 3) {
        console.warn("[Profile_Sync] Permission Denied. Retrying in 1s (auth delay)...");
        await new Promise(r => setTimeout(r, 1000));
        return updateUserProfile(uid, data, retryCount + 1);
    }
    console.error("[Profile_Sync] FATAL:", e.message);
    throw e;
  }
};

export const getUserProfile = async (uid: string): Promise<UserProfile | null> => {
  try {
    const snapshot = await get(child(ref(db), `roomers/${uid}`));
    if (snapshot.exists()) return snapshot.val() as UserProfile;
    return null;
  } catch (e: any) {
    return null;
  }
};

export const findUserByEmailOrUsername = async (searchTerm: string): Promise<Roomer | null> => {
  const roomersRef = ref(db, 'roomers');
  let cleanTerm = searchTerm.trim();
  
  try {
      // 1. Email Search
      let q = query(roomersRef, orderByChild('email'), equalTo(cleanTerm));
      let snapshot = await get(q);
      
      if (!snapshot.exists()) {
        if (!cleanTerm.includes('@') && !cleanTerm.startsWith('$')) cleanTerm = '$' + cleanTerm;
        // 2. Exact Username Search
        q = query(roomersRef, orderByChild('username'), equalTo(cleanTerm));
        snapshot = await get(q);
        
        if (!snapshot.exists() && cleanTerm.startsWith('$')) {
            // 3. Capitalized Variant Search
            const namePart = cleanTerm.substring(1);
            const capitalized = '$' + namePart.charAt(0).toUpperCase() + namePart.slice(1);
            q = query(roomersRef, orderByChild('username'), equalTo(capitalized));
            snapshot = await get(q);
        }
      }

      if (snapshot.exists()) {
        const results = snapshot.val();
        const uid = Object.keys(results)[0];
        const userData = results[uid];
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
  } catch (e: any) {
      console.error("[Search_Error]", e.message);
      throw e;
  }
};

export const addRoomerToUser = async (currentUid: string, targetUid: string) => {
  try {
      const updates: any = {};
      updates[`roomers/${currentUid}/addedRoomers/${targetUid}`] = 'pending';
      updates[`roomers/${targetUid}/pendingApprovals/${currentUid}`] = true;
      await update(ref(db), updates);
      console.log("[Add_Roomer] Success");
  } catch (e: any) {
      console.error("[Add_Roomer] Error:", e.message);
      throw e;
  }
};

export const approveRoomer = async (currentUid: string, targetUid: string) => {
    try {
        const updates: any = {};
        updates[`roomers/${currentUid}/pendingApprovals/${targetUid}`] = null;
        updates[`roomers/${currentUid}/addedRoomers/${targetUid}`] = 'accepted';
        updates[`roomers/${targetUid}/addedRoomers/${currentUid}`] = 'accepted';
        await update(ref(db), updates);
    } catch (e: any) {
        console.error("[Approve_Error]", e.message);
    }
};

export const deleteRoomer = async (currentUid: string, targetUid: string) => {
    try {
        const updates: any = {};
        updates[`roomers/${currentUid}/addedRoomers/${targetUid}`] = null;
        updates[`roomers/${currentUid}/pendingApprovals/${targetUid}`] = null;
        updates[`roomers/${targetUid}/addedRoomers/${currentUid}`] = null;
        updates[`roomers/${targetUid}/pendingApprovals/${currentUid}`] = null;
        await update(ref(db), updates);
    } catch (e: any) {
        console.error("[Delete_Error]", e.message);
    }
};

export const getRoomerDetails = async (uid: string, status: Roomer['status']): Promise<Roomer | null> => {
  try {
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
  } catch (e) {
      return null;
  }
};