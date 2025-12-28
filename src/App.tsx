import React, { useEffect, useState } from 'react';
import { auth, updateUserProfile, requestAndStoreToken } from './services/firebase';
import { onAuthStateChanged, User, getRedirectResult, setPersistence, browserLocalPersistence } from 'firebase/auth';
import Login from './components/Login';
import ChatView from './components/ChatView';
import RoomsList from './components/RoomsList';
import ProfileView from './components/ProfileView';
import DebugConsole from './components/DebugConsole';
import { UserProfile, AppView, Roomer } from './types'; 

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  
  // Persist the current view to LocalStorage so app state survives reloads/re-opens
  const [view, setView] = useState<AppView>(() => {
    try {
        const saved = localStorage.getItem('onyx_app_view');
        return saved ? JSON.parse(saved) : { name: 'ROOMS_LIST' };
    } catch (e) {
        return { name: 'ROOMS_LIST' };
    }
  });

  const [isDarkMode, setIsDarkMode] = useState(true);
  const [loadingAuth, setLoadingAuth] = useState(true);

  useEffect(() => {
    localStorage.setItem('onyx_app_view', JSON.stringify(view));
  }, [view]);

  // 1. Auth Init & Hydration
  useEffect(() => {
    let unsubscribe: () => void;

    const initAuth = async () => {
        try {
            console.log("STAGE 1: Init Auth - Setting Persistence");
            await setPersistence(auth, browserLocalPersistence);
            
            // Check Redirect Result (Standard check for returning from OAuth)
            try {
                const result = await getRedirectResult(auth);
                if (result?.user) {
                    console.log("[Auth] Redirect Success:", result.user.email);
                    setUser(result.user);
                    updateUserProfile(result.user.uid, {
                        email: result.user.email,
                        displayName: result.user.displayName,
                        photoURL: result.user.photoURL,
                        lastOnline: Date.now()
                    });
                    // Trigger token request on login
                    requestAndStoreToken(result.user.uid);
                }
            } catch (e: any) {
                console.error("[Auth] Redirect Error:", e.code, e.message);
            }

            // Attach Listener
            unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
                console.log("STAGE 3: Auth State Changed:", currentUser ? currentUser.email : "NULL");
                if (currentUser) {
                    setUser(currentUser);
                    setLoadingAuth(false);
                    // Trigger token request on session restore
                    requestAndStoreToken(currentUser.uid);
                } else {
                    setUser(null);
                    setLoadingAuth(false);
                }
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
        <div className="h-[100dvh] w-screen bg-black flex flex-col items-center justify-center gap-4">
            <div className="w-12 h-12 rounded-full border-2 border-zinc-800 border-t-white animate-spin" />
            <p className="text-zinc-500 text-xs font-mono">AUTHENTICATING...</p>
        </div>
      );
  }

  return (
    // Rely on 100dvh and the updated meta tag for layout stability
    <div className={`w-screen h-[100dvh] relative flex flex-col overflow-hidden ${isDarkMode ? 'bg-black text-white' : 'bg-gray-100 text-black'}`}>
      <DebugConsole />
      
      <div className="flex-1 w-full h-full relative z-10 flex flex-col">
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