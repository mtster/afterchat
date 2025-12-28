export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  username?: string; // e.g. $OnyxMaster
  fcmToken?: string;
  lastOnline?: number;
  activeRoom?: string | null;
}

export interface Message {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: number;
}

// Roomer now includes status for the approval flow
export interface Roomer {
  uid: string;
  displayName: string;
  photoURL: string | null;
  username: string | null;
  email: string | null;
  status: 'accepted' | 'pending_incoming' | 'pending_outgoing'; 
}

export type AppView = 
  | { name: 'ROOMS_LIST' }
  | { name: 'CHAT'; roomId: string; recipient: Roomer }
  | { name: 'PROFILE' };