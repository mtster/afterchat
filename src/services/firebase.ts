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

console.log("[Firebase_Init] Initializing with config for project:", firebaseConfig.projectId);

export const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);
export const db = getDatabase(app);
export const googleProvider = new GoogleAuthProvider();

// Helper to sign in with email/password
export const signInWithEmail = (email: string, pass: string) => {
    console.log("[Auth_Action] Attempting Sign In for:", email);
    return signInWithEmailAndPassword(auth, email, pass);
};

// Helper to create account with email/password
export const signUpWithEmail = (email: string, pass: string) => {
    console.log("[Auth_Action] Attempting Sign Up for:", email);
    return createUserWithEmailAndPassword(auth, email, pass);
};

export const messaging = async () => {
  try {
    const supported = await isSupported();
    return supported ? getMessaging(app) : null;
  } catch (err) {
    console.error("[Messaging_Error] isSupported failed:", err);
    return null;
  }
};

export const requestAndStoreToken = async (uid: string) => {
  try {
    if (typeof window === 'undefined' || !('Notification' in window)) {
        console.log("[FCM_Check] Notifications not supported in this environment.");
        return;
    }

    const msg = await messaging();
    if (!msg) {
        console.log("[FCM_Check] Messaging service unavailable.");
        return;
    }

    console.log("[FCM_Permission] Current status:", Notification.permission);
    
    // Only request if not already granted
    if (Notification.permission === 'granted') {
        const currentVapidKey = VAPID_KEY !== "YOUR_VAPID_KEY_HERE" ? VAPID_KEY : import.meta.env.VITE_FIREBASE_VAPID_KEY;
        const token = await getToken(msg, { vapidKey: currentVapidKey });
        if (token) {
            console.log("[FCM_Success] Token exists and is active:", token);
            await update(ref(db, `roomers/${uid}`), { fcmToken: token });
        }
        return;
    }

    if (Notification.permission === 'denied') {
        console.warn("[FCM_Denied] Permission already denied. User must manually enable in settings.");
        return;
    }

    console.log("[FCM_Request] Prompting user for permission...");
    const permission = await Notification.requestPermission();
    console.log("[FCM_Response] Permission response:", permission);
    
    if (permission === 'granted') {
        const currentVapidKey = VAPID_KEY !== "YOUR_VAPID_KEY_HERE" ? VAPID_KEY : import.meta.env.VITE_FIREBASE_VAPID_KEY;
        const token = await getToken(msg, { vapidKey: currentVapidKey });

        if (token) {
            console.log("[FCM_Generated] Token successfully generated:", token);
            await update(ref(db, `roomers/${uid}`), { fcmToken: token });
        }
    }
  } catch (e: any) {
      console.error("[FCM_Fatal] Critical error in requestAndStoreToken:", e.message);
  }
};

export const setupNotifications = (uid: string) => {
    console.log("[Bell_Click] Manually triggering setup for UID:", uid);
    return requestAndStoreToken(uid);
};

export const onMessageListener = async (callback: (payload: MessagePayload) => void) => {
  const msg = await messaging();
  if (msg) {
    onMessage(msg, (payload) => {
        console.log("[FCM_Foreground] Received payload:", payload);
        callback(payload);
    });
  }
};

export const updateUserProfile = async (uid: string, data: Partial<UserProfile>) => {
  console.log(`[DB_Update] Updating profile for ${uid}. Data:`, JSON.stringify(data));
  try {
    const userRef = ref(db, `roomers/${uid}`);
    await update(userRef, data);
    console.log("[DB_Update] Success");
  } catch (e: any) {
    console.error("[DB_Update] FAILED:", e.code, e.message);
    throw e;
  }
};

export const getUserProfile = async (uid: string): Promise<UserProfile | null> => {
  console.log(`[DB_Read] Fetching profile for ${uid}`);
  try {
    const snapshot = await get(child(ref(db), `roomers/${uid}`));
    if (snapshot.exists()) {
      console.log("[DB_Read] Success: Found user");
      return snapshot.val() as UserProfile;
    }
    console.log("[DB_Read] Success: User does not exist");
    return null;
  } catch (e: any) {
    console.error("[DB_Read] FAILED:", e.code, e.message);
    return null;
  }
};

export const findUserByEmailOrUsername = async (searchTerm: string): Promise<Roomer | null> => {
  console.log(`[Search] Searching for: "${searchTerm}"`);
  const roomersRef = ref(db, 'roomers');
  let cleanTerm = searchTerm.trim();
  
  try {
      // 1. Try Email Exact Match
      let q = query(roomersRef, orderByChild('email'), equalTo(cleanTerm));
      let snapshot = await get(q);
      
      if (!snapshot.exists()) {
        console.log("[Search] No match for exact email. Trying username variants...");
        // Ensure term has $ prefix for username matching
        if (!cleanTerm.includes('@') && !cleanTerm.startsWith('$')) {
            cleanTerm = '$' + cleanTerm;
        }
        
        // 2. Try Exact Username (Case-Sensitive as per FB logic)
        q = query(roomersRef, orderByChild('username'), equalTo(cleanTerm));
        snapshot = await get(q);
        
        if (!snapshot.exists() && cleanTerm.startsWith('$')) {
            // 3. Try Capitalized Variant
            const namePart = cleanTerm.substring(1);
            const capitalized = '$' + namePart.charAt(0).toUpperCase() + namePart.slice(1);
            console.log(`[Search] Trying variant: ${capitalized}`);
            q = query(roomersRef, orderByChild('username'), equalTo(capitalized));
            snapshot = await get(q);
        }
      }

      if (snapshot.exists()) {
        const results = snapshot.val();
        const uid = Object.keys(results)[0];
        const userData = results[uid];
        console.log(`[Search] Match Found! UID: ${uid}, Name: ${userData.displayName}`);
        return {
          uid,
          displayName: userData.displayName || 'Unknown',
          photoURL: userData.photoURL || null,
          username: userData.username || null,
          email: userData.email || null,
          status: 'accepted' 
        };
      }
      
      console.log("[Search] No user found matching criteria.");
      return null;
  } catch (e: any) {
      console.error("[Search_Error] Database query failed:", e.message);
      throw e;
  }
};

export const addRoomerToUser = async (currentUid: string, targetUid: string) => {
  console.log(`[DB_Add_Roomer] ${currentUid} adding ${targetUid}`);
  try {
      const updates: any = {};
      updates[`roomers/${currentUid}/addedRoomers/${targetUid}`] = 'pending';
      updates[`roomers/${targetUid}/pendingApprovals/${currentUid}`] = true;
      await update(ref(db), updates);
      console.log("[DB_Add_Roomer] Relationship initialized");
  } catch (e: any) {
      console.error("[DB_Add_Roomer] FAILED:", e.message);
      throw e;
  }
};

export const approveRoomer = async (currentUid: string, targetUid: string) => {
    console.log(`[DB_Approve] ${currentUid} approving ${targetUid}`);
    try {
        const updates: any = {};
        updates[`roomers/${currentUid}/pendingApprovals/${targetUid}`] = null;
        updates[`roomers/${currentUid}/addedRoomers/${targetUid}`] = 'accepted';
        updates[`roomers/${targetUid}/addedRoomers/${currentUid}`] = 'accepted';
        await update(ref(db), updates);
        console.log("[DB_Approve] Relationship accepted");
    } catch (e: any) {
        console.error("[DB_Approve] FAILED:", e.message);
    }
};

export const deleteRoomer = async (currentUid: string, targetUid: string) => {
    console.log(`[DB_Delete] ${currentUid} removing ${targetUid}`);
    try {
        const updates: any = {};
        updates[`roomers/${currentUid}/addedRoomers/${targetUid}`] = null;
        updates[`roomers/${currentUid}/pendingApprovals/${targetUid}`] = null;
        updates[`roomers/${targetUid}/addedRoomers/${currentUid}`] = null;
        updates[`roomers/${targetUid}/pendingApprovals/${currentUid}`] = null;
        await update(ref(db), updates);
        console.log("[DB_Delete] Relationship severed");
    } catch (e: any) {
        console.error("[DB_Delete] FAILED:", e.message);
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