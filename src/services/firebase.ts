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
  console.log(`[Profile_Sync] Updating roomers/${uid}... Attempt ${retryCount + 1}`);
  try {
    const userRef = ref(db, `roomers/${uid}`);
    await update(userRef, data);
    console.log("[Profile_Sync] SUCCESS");
  } catch (e: any) {
    if (e.code === 'PERMISSION_DENIED' && retryCount < 3) {
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
    return snapshot.exists() ? snapshot.val() as UserProfile : null;
  } catch (e: any) {
    return null;
  }
};

/**
 * Searches for a user by Email, Username, or Display Name
 */
export const findUserByEmailOrUsername = async (searchTerm: string): Promise<Roomer | null> => {
  const term = searchTerm.trim();
  const roomersRef = ref(db, 'roomers');
  console.log(`[Search_Step] Initiating search for: "${term}"`);

  const tryQuery = async (field: string, value: string) => {
      console.log(`[Search_Step] Querying ${field} == "${value}"`);
      const q = query(roomersRef, orderByChild(field), equalTo(value));
      const snap = await get(q);
      if (snap.exists()) {
          const val = snap.val();
          const uid = Object.keys(val)[0];
          console.log(`[Search_Step] MATCH FOUND in ${field}! UID: ${uid}`);
          return { uid, data: val[uid] };
      }
      return null;
  };

  try {
      // 1. Try Email
      let result = await tryQuery('email', term);
      
      // 2. Try Username (Exact)
      if (!result) {
          let uTerm = term.startsWith('$') ? term : '$' + term;
          result = await tryQuery('username', uTerm);
      }

      // 3. Try Username (Capitalized if needed)
      if (!result && term.length > 0) {
          const uTerm = '$' + term.charAt(0).toUpperCase() + term.slice(1);
          if (uTerm !== term) result = await tryQuery('username', uTerm);
      }

      // 4. Try Display Name (Exact)
      if (!result) {
          result = await tryQuery('displayName', term);
      }

      if (result) {
          return {
              uid: result.uid,
              displayName: result.data.displayName || 'Unknown',
              photoURL: result.data.photoURL || null,
              username: result.data.username || null,
              email: result.data.email || null,
              status: 'accepted'
          };
      }

      console.log("[Search_Step] No match found across all indices.");
      return null;
  } catch (e: any) {
      console.error("[Search_Fatal] Database query failed:", e.message);
      throw e;
  }
};

export const addRoomerToUser = async (currentUid: string, targetUid: string) => {
  console.log(`[Add_Step] Linking ${currentUid} -> ${targetUid}`);
  try {
      const updates: any = {};
      updates[`roomers/${currentUid}/addedRoomers/${targetUid}`] = 'pending';
      updates[`roomers/${targetUid}/pendingApprovals/${currentUid}`] = true;
      await update(ref(db), updates);
      console.log("[Add_Step] Database update successful.");
  } catch (e: any) {
      console.error("[Add_Step] FAILED:", e.message);
      throw e;
  }
};

export const approveRoomer = async (currentUid: string, targetUid: string) => {
    console.log(`[Action] Approving ${targetUid}`);
    try {
        const updates: any = {};
        updates[`roomers/${currentUid}/pendingApprovals/${targetUid}`] = null;
        updates[`roomers/${currentUid}/addedRoomers/${targetUid}`] = 'accepted';
        updates[`roomers/${targetUid}/addedRoomers/${currentUid}`] = 'accepted';
        await update(ref(db), updates);
    } catch (e: any) {}
};

export const deleteRoomer = async (currentUid: string, targetUid: string) => {
    console.log(`[Action] Deleting relationship with ${targetUid}`);
    try {
        const updates: any = {};
        updates[`roomers/${currentUid}/addedRoomers/${targetUid}`] = null;
        updates[`roomers/${currentUid}/pendingApprovals/${targetUid}`] = null;
        updates[`roomers/${targetUid}/addedRoomers/${currentUid}`] = null;
        updates[`roomers/${targetUid}/pendingApprovals/${currentUid}`] = null;
        await update(ref(db), updates);
    } catch (e: any) {}
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