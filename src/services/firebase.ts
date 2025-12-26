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
    // NOTE: Firebase does not support native case-insensitive queries. 
    // We assume the user creates usernames as $Name. 
    // If the search failed, we try a capitalized version if the input was lowercase.
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
    // Return base roomer info (status undefined here)
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
  const updates: any = {};
  // A considers B as "pending" in their added list
  updates[`users/${currentUid}/addedUsers/${targetUid}`] = 'pending';
  // B sees A in their "pendingApprovals" list
  updates[`users/${targetUid}/pendingApprovals/${currentUid}`] = true;
  
  await update(ref(db), updates);
};

// 2. APPROVE: User B accepts User A
export const approveRoomer = async (currentUid: string, targetUid: string) => {
    const updates: any = {};
    // Move from pendingApprovals to addedUsers for Me (B)
    updates[`users/${currentUid}/pendingApprovals/${targetUid}`] = null;
    updates[`users/${currentUid}/addedUsers/${targetUid}`] = 'accepted';
    
    // Update the Other Person (A) to show status as accepted
    updates[`users/${targetUid}/addedUsers/${currentUid}`] = 'accepted';
    
    await update(ref(db), updates);
};

// 3. REJECT / DELETE: User B rejects A, OR User A deletes B
export const deleteRoomer = async (currentUid: string, targetUid: string) => {
    const updates: any = {};
    
    // Clean up my lists
    updates[`users/${currentUid}/addedUsers/${targetUid}`] = null;
    updates[`users/${currentUid}/pendingApprovals/${targetUid}`] = null;

    // Clean up their lists (So the chat disappears/blocks for them too)
    // "If User A has deleted User B, User B should see a message..."
    // To support "User B sees a message", we actually REMOVE the valid connection.
    // However, if we fully remove the node, the chat disappears from the list entirely.
    // If we want the chat to remain but be "blocked", we would need a 'blocked' status.
    // The requirement says: "If User A has deleted User B, User B should see a message... This message must replace the message input".
    // This implies User B still SEES the chat in the list.
    // BUT, the requirement ALSO says "where all of the roomers the user has added are displayed".
    // If I delete you, you are no longer in my added list.
    // Let's stick to the prompt for rejection: "The entry is removed from User B's pendingApprovals and User A's addedUsers."
    
    // Rejection Logic (Pre-acceptance)
    updates[`users/${targetUid}/addedUsers/${currentUid}`] = null;
    updates[`users/${targetUid}/pendingApprovals/${currentUid}`] = null;

    await update(ref(db), updates);
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
