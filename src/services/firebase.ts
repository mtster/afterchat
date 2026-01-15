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
  authDomain: "afterchat.vercel.app",
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
  console.log(`[FCM] Initializing token sync for: ${uid}`);
  try {
    if (typeof window === 'undefined' || !('Notification' in window)) {
        console.warn("[FCM] Notifications not supported in this browser.");
        return;
    }
    const msg = await messaging();
    if (!msg) {
        console.warn("[FCM] Messaging is not supported or failed to initialize.");
        return;
    }

    let permission = Notification.permission;
    console.log(`[FCM] Current status: ${permission}`);

    if (permission === 'default') {
        console.log("[FCM] Prompting user for permission...");
        permission = await Notification.requestPermission();
        console.log(`[FCM] User response: ${permission}`);
    }

    if (permission === 'granted') {
        const currentVapidKey = VAPID_KEY !== "YOUR_VAPID_KEY_HERE" ? VAPID_KEY : import.meta.env.VITE_FIREBASE_VAPID_KEY;
        console.log(`[FCM] Fetching token with VAPID key...`);
        
        const token = await getToken(msg, { vapidKey: currentVapidKey });
        if (token) {
            console.log(`[FCM] Token generated: ${token.substring(0, 15)}...`);
            await update(ref(db, `roomers/${uid}`), { fcmToken: token });
            console.log("[FCM] SUCCESS: Token stored in database.");
        } else {
            console.warn("[FCM] Token generation returned null.");
        }
    } else {
        console.warn(`[FCM] Cannot fetch token: Permission is ${permission}`);
    }
  } catch (e: any) {
      console.error("[FCM_Fatal]", e.message);
  }
};

export const setupNotifications = (uid: string) => requestAndStoreToken(uid);

export const onMessageListener = async (callback: (payload: MessagePayload) => void) => {
  const msg = await messaging();
  if (msg) onMessage(msg, (payload) => {
    console.log("[FCM] Foreground message received:", payload);
    callback(payload);
  });
};

export const updateUserProfile = async (uid: string, data: Partial<UserProfile>, retryCount = 0) => {
  console.log(`[Profile_Sync] Updating roomers/${uid}... (Attempt ${retryCount + 1})`);
  try {
    const userRef = ref(db, `roomers/${uid}`);
    await update(userRef, data);
    console.log("[Profile_Sync] SUCCESS");
  } catch (e: any) {
    if (e.code === 'PERMISSION_DENIED' && retryCount < 3) {
        console.warn("[Profile_Sync] Permission Denied. Retrying in 1s...");
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
 * Searches across Email, Username, and Display Name
 */
export const findUserByEmailOrUsername = async (searchTerm: string): Promise<Roomer | null> => {
  const term = searchTerm.trim();
  const roomersRef = ref(db, 'roomers');
  console.log(`[Search] Triggered search for: "${term}"`);

  const runQuery = async (field: string, value: string) => {
      console.log(`[Search_Step] Checking ${field} == "${value}"`);
      try {
        const q = query(roomersRef, orderByChild(field), equalTo(value));
        const snap = await get(q);
        if (snap.exists()) {
            const val = snap.val();
            const uid = Object.keys(val)[0];
            console.log(`[Search_Step] Success! Match in ${field}. UID: ${uid}`);
            return { uid, data: val[uid] };
        }
      } catch (e: any) {
        // Catch Missing Index Error specific to Firebase
        if (e.message && e.message.includes("Index not defined")) {
             console.error(`[Search_Fatal] Missing index for '${field}'.`);
             throw new Error(`MISSING_INDEX:${field}`);
        }
        throw e;
      }
      return null;
  };

  try {
      // 1. Check Email
      let res = await runQuery('email', term);
      
      // 2. Check Username (normalized with $)
      if (!res) {
          const uName = term.startsWith('$') ? term : '$' + term;
          res = await runQuery('username', uName);
      }

      // 3. Check Username (Capitalized)
      if (!res && term.length > 0) {
          const capitalized = '$' + term.charAt(0).toUpperCase() + term.slice(1);
          if (capitalized !== term) res = await runQuery('username', capitalized);
      }

      // 4. Check Display Name
      if (!res) {
          res = await runQuery('displayName', term);
      }

      if (res) {
          return {
              uid: res.uid,
              displayName: res.data.displayName || 'Unknown',
              photoURL: res.data.photoURL || null,
              username: res.data.username || null,
              email: res.data.email || null,
              status: 'accepted'
          };
      }

      console.log("[Search] No user found with provided credentials.");
      return null;
  } catch (e: any) {
      console.error("[Search_Fatal]", e.message);
      throw e;
  }
};

export const addRoomerToUser = async (currentUid: string, targetUid: string) => {
  console.log(`[Add_Action] Adding ${targetUid} to ${currentUid}'s list`);
  try {
      const updates: any = {};
      updates[`roomers/${currentUid}/addedRoomers/${targetUid}`] = 'pending';
      updates[`roomers/${targetUid}/pendingApprovals/${currentUid}`] = true;
      await update(ref(db), updates);
      console.log("[Add_Action] Database update finished.");
  } catch (e: any) {
      console.error("[Add_Action] FAILED:", e.message);
      throw e;
  }
};

export const approveRoomer = async (currentUid: string, targetUid: string) => {
    console.log(`[Approval] Approving ${targetUid}`);
    try {
        const updates: any = {};
        updates[`roomers/${currentUid}/pendingApprovals/${targetUid}`] = null;
        updates[`roomers/${currentUid}/addedRoomers/${targetUid}`] = 'accepted';
        updates[`roomers/${targetUid}/addedRoomers/${currentUid}`] = 'accepted';
        await update(ref(db), updates);
        console.log("[Approval] SUCCESS");
    } catch (e: any) {
        console.error("[Approval] FAILED:", e.message);
    }
};

export const deleteRoomer = async (currentUid: string, targetUid: string) => {
    console.log(`[Delete] Removing ${targetUid}`);
    try {
        const updates: any = {};
        updates[`roomers/${currentUid}/addedRoomers/${targetUid}`] = null;
        updates[`roomers/${currentUid}/pendingApprovals/${targetUid}`] = null;
        updates[`roomers/${targetUid}/addedRoomers/${currentUid}`] = null;
        updates[`roomers/${targetUid}/pendingApprovals/${currentUid}`] = null;
        await update(ref(db), updates);
        console.log("[Delete] SUCCESS");
    } catch (e: any) {
        console.error("[Delete] FAILED:", e.message);
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