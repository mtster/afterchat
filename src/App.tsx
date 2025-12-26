import React, { useEffect, useState } from 'react';
import { auth, updateUserProfile } from './services/firebase';
import { onAuthStateChanged, User, getRedirectResult } from 'firebase/auth';
import Login from './components/Login';
import ChatView from './components/ChatView';
import DebugConsole from './components/DebugConsole';
import { UserProfile } from './types'; 

export default function App() {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    console.log("STAGE 1: App Component Mounted");

    const initAuth = async () => {
        console.log("STAGE 2: Checking getRedirectResult...");
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
            } else {
                console.log("STAGE 3 [INFO]: No Redirect Result.");
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
      } else {
        setUser(null);
      }
    });

    return () => unsubscribe();
  }, []);

  // Transform Firebase User to local UserProfile type
  const userProfile: UserProfile | null = user ? {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL
  } : null;

  return (
    <div className="h-[100dvh] w-screen relative flex flex-col bg-black text-white overflow-hidden">
      {/* ALWAYS VISIBLE DEBUGGER - Top Layer */}
      <DebugConsole />
      
      <div className="flex-1 w-full h-full relative z-10">
        {!userProfile ? (
          <Login />
        ) : (
          <ChatView 
            roomId="general" 
            currentUser={userProfile} 
            onBack={() => console.log("Back navigation disabled in single-room mode")} 
          />
        )}
      </div>
    </div>
  );
}