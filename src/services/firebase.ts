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

export const VAPID_KEY = "BCBn5bm4gG3CmNeLo-E9KzZInuRYwtA_byl9pHw5XiuW5Py-DQRcuCh-uWqLf0kmfzA6bqS0nNq4a6l9EP9KPE8"; 

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL
};

console.log("[Firebase_XRAY] Initializing App...");
export const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);
export const db = getDatabase(app);
export const googleProvider = new GoogleAuthProvider();

export const signInWithEmail = (email: string, pass: string) => signInWithEmailAndPassword(auth, email, pass);
export const signUpWithEmail = (email: string, pass: string) => createUserWithEmailAndPassword(auth, email, pass);

export const messaging = async () => {
  try {
    const supported = await isSupported();
    if (!supported) console.log("[FCM_Init] Browser does not support messaging.");
    return supported ? getMessaging(app) : null;
  } catch (err: any) {
    console.error("[FCM_Init] Error checking support:", err.message);
    return null;
  }
};

export const requestAndStoreToken = async (uid: string) => {
  console.log(`[FCM_XRAY] Starting token sync for User: ${uid}`);
  try {
    if (typeof window === 'undefined' || !('Notification' in window)) {
        console.warn("[FCM_XRAY] Notifications API not available.");
        return;
    }

    const msg = await messaging();
    if (!msg) {
        console.warn("[FCM_XRAY] Messaging instance failed to initialize.");
        return;
    }

    let permission = Notification.permission;
    console.log(`[FCM_XRAY] Current permission state: ${permission}`);

    if (permission === 'default') {
        console.log("[FCM_XRAY] Requesting permission...");
        permission = await Notification.requestPermission();
        console.log(`[FCM_XRAY] Permission request result: ${permission}`);
    }

    if (permission === 'granted') {
        // CRITICAL UPDATE: Wait for Service Worker to be ready
        console.log("[FCM_XRAY] Permission granted. Waiting for Service Worker ready state...");
        
        if (!('serviceWorker' in navigator)) {
             console.error("[FCM_XRAY] Service Workers are not supported in this browser.");
             return;
        }

        // Wait for the service worker registration to be ready
        const registration = await navigator.serviceWorker.ready;
        console.log("[FCM_XRAY] Service Worker is ready:", registration.scope);

        console.log(`[FCM_XRAY] Fetching token with VAPID Key: ${VAPID_KEY.substring(0, 5)}...`);
        
        try {
            // Pass the registration to getToken to ensure it uses the correct SW
            const token = await getToken(msg, { 
                vapidKey: VAPID_KEY,
                serviceWorkerRegistration: registration 
            });

            if (token) {
                console.log(`[FCM_XRAY] Token obtained: ${token.substring(0, 10)}...`);
                await update(ref(db, `roomers/${uid}`), { fcmToken: token });
                console.log("[FCM_XRAY] Token successfully saved to Realtime Database.");
            } else {
                console.warn("[FCM_XRAY] No token generated - check VAPID key and PWA status. Token is null.");
            }
        } catch (tokenErr: any) {
            console.error("[FCM_XRAY] getToken failed:", tokenErr);
        }
    } else {
        console.warn(`[FCM_XRAY] Permission denied or dismissed (${permission}).`);
    }
  } catch (e: any) {
      console.error("[FCM_XRAY] Fatal Error during token request:", e);
  }
};

export const setupNotifications = (uid: string) => requestAndStoreToken(uid);

export const onMessageListener = async (callback: (payload: MessagePayload) => void) => {
  try {
      const msg = await messaging();
      if (msg) {
          onMessage(msg, (payload) => {
            console.log("[FCM_Foreground_XRAY] Message received:", payload);
            try {
                callback(payload);
            } catch (callbackErr) {
                console.error("[FCM_Foreground_XRAY] Error in message callback:", callbackErr);
            }
          });
      }
  } catch (err) {
      console.error("[FCM_Foreground_XRAY] Failed to setup message listener:", err);
  }
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
        if (e.message && e.message.includes("Index not defined")) {
             console.error(`[Search_Fatal] Missing index for '${field}'.`);
             throw new Error(`MISSING_INDEX:${field}`);
        }
        throw e;
      }
      return null;
  };

  try {
      let res = await runQuery('email', term);
      if (!res) {
          const uName = term.startsWith('$') ? term : '$' + term;
          res = await runQuery('username', uName);
      }
      if (!res && term.length > 0) {
          const capitalized = '$' + term.charAt(0).toUpperCase() + term.slice(1);
          if (capitalized !== term) res = await runQuery('username', capitalized);
      }
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
  try {
      const updates: any = {};
      updates[`roomers/${currentUid}/addedRoomers/${targetUid}`] = 'pending';
      updates[`roomers/${targetUid}/pendingApprovals/${currentUid}`] = true;
      await update(ref(db), updates);
  } catch (e: any) {
      console.error("[Add_Action] FAILED:", e.message);
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
        console.error("[Approval] FAILED:", e.message);
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