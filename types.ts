export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
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

export interface Room {
  id: string;
  name: string;
  lastMessage?: string;
  lastMessageTimestamp?: number;
  participants: Record<string, boolean>; // uid: true
  avatar?: string;
}

export interface ChatState {
  activeRoomId: string | null;
}

export enum AppScreen {
  LOGIN = 'LOGIN',
  ROOMS = 'ROOMS',
  CHAT = 'CHAT',
  PROFILE = 'PROFILE'
}