export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  username?: string; // e.g. $OnyxMaster
  fcmToken?: string;
  lastOnline?: number;
}

export interface Message {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: number;
}

// Simplified Roomer (Contact) interface
export interface Roomer {
  uid: string;
  displayName: string;
  photoURL: string | null;
  username: string | null;
  email: string | null;
}

export type AppView = 
  | { name: 'ROOMS_LIST' }
  | { name: 'CHAT'; roomId: string; recipient: Roomer }
  | { name: 'PROFILE' };
