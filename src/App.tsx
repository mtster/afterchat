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

    // Detect Standalone Mode
    const isIOSStandalone = (window.navigator as any).standalone === true;
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || isIOSStandalone;

    // --- AGGRESSIVE HANDSHAKE FUNCTION ---
    const runHandshake = async () => {
        // Check both storages
        const localPending = localStorage.getItem('onyx_auth_redirect_pending') === 'true';
        const sessionPending = sessionStorage.getItem('onyx_auth_redirect_pending') === 'true';
        
        // Fail-safe: If standalone, always check, even if flags are missing (iOS wipes storage often)
        const shouldCheck = localPending || sessionPending || isStandalone;

        if (!shouldCheck) {
            console.log("[Handshake] No pending redirect flag found and not standalone.");
            return;
        }

        if (isStandalone && !localPending && !sessionPending) {
            console.log("[Handshake] Standalone Fail-safe Triggered (No flags found)");
        }

        console.log("[Handshake] Starting aggressive check...");
        
        // Retry mechanism: 3 attempts with 500ms delay
        for (let i = 1; i <= 3; i++) {
            try {
                console.log(`[Handshake] Attempt ${i}/3`);
                const result = await getRedirectResult(auth);
                if (result?.user) {
                    console.log(`[Handshake] Redirect Result Received: ${result.user.email}`);
                    
                    // Cleanup Flags
                    localStorage.removeItem('onyx_auth_redirect_pending');
                    sessionStorage.removeItem('onyx_auth_redirect_pending');
                    
                    // Set User
                    setUser(result.user);
                    setLoadingAuth(false);
                    
                    // Sync Profile
                    updateUserProfile(result.user.uid, {
                        email: result.user.email,
                        displayName: result.user.displayName,
                        photoURL: result.user.photoURL,
                        lastOnline: Date.now()
                    });
                    return; // Handshake complete
                } else {
                     console.log(`[Handshake] Attempt ${i}: Redirect Result: Null.`);
                }
            } catch (e: any) {
                console.error(`[Handshake] Error attempt ${i}:`, e.code, e.message);
            }
            // Wait 500ms before next retry
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        // Exhausted
        console.log("[Handshake] Exhausted all attempts. Clearing flags.");
        localStorage.removeItem('onyx_auth_redirect_pending');
        sessionStorage.removeItem('onyx_auth_redirect_pending');
        
        // NOTE: We do NOT force setLoadingAuth(false) here immediately if standalone,
        // we let onAuthStateChanged's grace period handle the final verdict.
    };

    const initAuth = async () => {
        try {
            console.log("STAGE 1: Init Auth - Setting Persistence");
            await setPersistence(auth, browserLocalPersistence);
            
            // Run handshake immediately on mount
            // We do NOT await this, let it run in parallel with the listener
            runHandshake();

            // 3. Attach Listener
            unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
                console.log("STAGE 3: Auth State Changed:", currentUser ? currentUser.email : "NULL");
                
                if (currentUser) {
                    // Success case
                    localStorage.removeItem('onyx_auth_redirect_pending');
                    sessionStorage.removeItem('onyx_auth_redirect_pending');
                    setUser(currentUser);
                    setLoadingAuth(false);
                } else {
                    // No user in Auth State
                    // Grace Period for Standalone
                    if (isStandalone) {
                        console.log("[AuthGuard] User null in Standalone. Initiating Grace Period (2s)...");
                        setTimeout(() => {
                            // Re-check auth.currentUser directly to see if handshake succeeded in the meantime
                            if (!auth.currentUser) {
                                console.log("[AuthGuard] Grace Period Over. Still no user. Showing Login.");
                                setUser(null);
                                setLoadingAuth(false);
                                setView({ name: 'ROOMS_LIST' });
                            } else {
                                console.log("[AuthGuard] Grace Period Over. User found! (Handshake success)");
                            }
                        }, 2000);
                    } else {
                        // Browser mode - fail fast
                        setUser(null);
                        setLoadingAuth(false);
                        setView({ name: 'ROOMS_LIST' });
                    }
                }
            });

        } catch (error: any) {
            console.error("Auth Init Critical Error:", error.code, error.message);
            setLoadingAuth(false);
        }
    };

    initAuth();

    // Visibility Listener to re-trigger handshake when returning to app (iOS PWA)
    const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
            console.log("[App] Visibility changed to VISIBLE. Checking handshake.");
            runHandshake();
        }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
        if (unsubscribe) unsubscribe();
        document.removeEventListener('visibilitychange', handleVisibilityChange);
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
            <p className="text-zinc-500 text-xs font-mono">AUTHENTICATING SECURE CHANNEL...</p>
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