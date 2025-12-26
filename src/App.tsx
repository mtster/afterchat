import React, { useEffect, useState } from 'react';
import { auth, updateUserProfile } from './services/firebase';
import { onAuthStateChanged, User, getRedirectResult, setPersistence, browserLocalPersistence } from 'firebase/auth';
import Login from './components/Login';
import ChatView from './components/ChatView';
import RoomsList from './components/RoomsList';
import ProfileView from './components/ProfileView';
import DebugConsole from './components/DebugConsole';
import { UserProfile, AppView, Roomer } from './types'; 

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [view, setView] = useState<AppView>({ name: 'ROOMS_LIST' });
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [loadingAuth, setLoadingAuth] = useState(true);

  // Auth Init & Hydration
  useEffect(() => {
    let unsubscribe: () => void;

    const initAuth = async () => {
        try {
            console.log("STAGE 1: Init Auth - Setting Persistence");
            // 1. Force Persistence (Critical for iOS)
            await setPersistence(auth, browserLocalPersistence);
            
            // 2. Consume Redirect Result (Standalone PWA Handshake)
            // We await this BEFORE listening to auth state to catch the token
            console.log("STAGE 2: Checking Redirect Result");
            const redirectResult = await getRedirectResult(auth);
            
            if (redirectResult && redirectResult.user) {
                console.log("STAGE 2 [SUCCESS]: Redirect User Found:", redirectResult.user.email);
                setUser(redirectResult.user);
                
                // Update DB immediately to ensure consistency
                updateUserProfile(redirectResult.user.uid, {
                    email: redirectResult.user.email,
                    displayName: redirectResult.user.displayName,
                    photoURL: redirectResult.user.photoURL,
                    lastOnline: Date.now()
                });
            } else {
                console.log("STAGE 2: No Redirect Result");
            }

            // 3. Attach Listener ONLY after Redirect Check is done
            // This prevents 'null' from overwriting a pending redirect user
            unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
                console.log("STAGE 3: Auth State Changed:", currentUser ? currentUser.email : "NULL");
                
                if (currentUser) {
                    setUser(currentUser);
                } else {
                    setUser(null);
                    setView({ name: 'ROOMS_LIST' });
                }
                
                setLoadingAuth(false);
            });

        } catch (error: any) {
            console.error("Auth Init Critical Error:", error.code, error.message);
            setLoadingAuth(false);
        }
    };

    initAuth();

    return () => {
        if (unsubscribe) unsubscribe();
    };
  }, []);

  const toggleTheme = () => {
      setIsDarkMode(!isDarkMode);
      if (isDarkMode) {
          document.documentElement.classList.remove('dark');
      } else {
          document.documentElement.classList.add('dark');
      }
  };

  const userProfile: UserProfile | null = user ? {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL,
  } : null;

  const handleNavigateChat = (roomer: Roomer) => {
    if (!user) return;
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

  if (loadingAuth) {
      return (
        <div className="h-[100dvh] w-screen bg-black flex items-center justify-center">
            <div className="w-12 h-12 rounded-full border-2 border-zinc-800 border-t-white animate-spin" />
        </div>
      );
  }

  return (
    <div className={`h-[100dvh] w-screen relative flex flex-col overflow-hidden ${isDarkMode ? 'bg-black text-white' : 'bg-gray-100 text-black'}`}>
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
                toggleTheme={toggleTheme}
                isDarkMode={isDarkMode}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}