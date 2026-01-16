import { UserProfile, Roomer } from '../types';

export const getPreferredName = (user: UserProfile | Roomer | { displayName: string | null; username?: string | null; email: string | null }): string => {
  if (user.username) return user.username;
  if (user.displayName) return user.displayName;
  return user.email || "Unknown User";
};
