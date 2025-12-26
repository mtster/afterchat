import React, { useEffect, useState } from 'react';
import { auth, updateUserProfile } from './services/firebase';
import { onAuthStateChanged, User, getRedirectResult } from 'firebase/auth';
import Login from './components/Login';
import ChatView from './components/ChatView';
import RoomsList from './components/RoomsList';
import ProfileView from './components/ProfileView';
import DebugConsole from './components/DebugConsole';
import { UserProfile, AppView, Roomer } from './types'; 

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [view, setView] = useState<AppView>({ name: 'ROOMS_LIST' });

  // Auth Init
  useEffect(() => {
    console.log("STAGE 1: App Component Mounted");

    const initAuth = async () => {
        try {
            const result = await getRedirectResult(auth);
            if (result) {
                console.log("STAGE 3 [SUCCESS]: Redirect Result Found for", result.user.email);
                setUser(result.user);
                updateUserProfile(result.user.uid, {
                    email: result.user.email,
                    displayName: result.user.displayName,
                    photoURL: result.user.photoURL,
                    lastOnline: Date.now()
                });
            }
        } catch (error: any) {
            console.error("STAGE 3 [ERROR]: Redirect Failed", error.code, error.message);
        }
    };

    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      console.log("STAGE 4: onAuthStateChanged event:", currentUser ? currentUser.email : "NULL");
      if (currentUser) {
        setUser(currentUser);
        // Force sync local profile state from DB if needed, but for now we rely on auth object
        // And we update DB on login.
      } else {
        setUser(null);
        setView({ name: 'ROOMS_LIST' });
      }
    });

    return () => unsubscribe();
  }, []);

  // Transform Firebase User to local UserProfile type
  // Note: We might want to fetch the 'username' from DB here to be accurate, 
  // but for the sake of speed we will pass basic info and let components fetch details.
  const userProfile: UserProfile | null = user ? {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL,
    // Note: Username isn't on the Auth object, it's in DB. 
    // ProfileView fetches it, so it's okay if undefined here initially.
  } : null;

  // Navigation Handlers
  const handleNavigateChat = (roomer: Roomer) => {
    if (!user) return;
    // Generate a consistent Room ID based on both UIDs sorted alphabetically
    // This ensures User A and User B always share the same room id.
    const participants = [user.uid, roomer.uid].sort();
    const roomId = `${participants[0]}_${participants[1]}`;
    
    setView({ name: 'CHAT', roomId, recipient: roomer });
  };

  const handleNavigateProfile = () => {
    setView({ name: 'PROFILE' });
  };

  const handleBackToRooms = () => {
    setView({ name: 'ROOMS_LIST' });
  };

  // Render Logic
  return (
    <div className="h-[100dvh] w-screen relative flex flex-col bg-black text-white overflow-hidden">
      <DebugConsole />
      
      <div className="flex-1 w-full h-full relative z-10">
        {!userProfile ? (
          <Login />
        ) : (
          <>
            {view.name === 'ROOMS_LIST' && (
              <RoomsList 
                currentUser={userProfile} 
                onNavigateChat={handleNavigateChat}
                onNavigateProfile={handleNavigateProfile}
              />
            )}

            {view.name === 'CHAT' && (
              <ChatView 
                roomId={view.roomId} 
                recipient={view.recipient}
                currentUser={userProfile} 
                onBack={handleBackToRooms} 
              />
            )}

            {view.name === 'PROFILE' && (
              <ProfileView 
                currentUser={userProfile}
                onBack={handleBackToRooms}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}