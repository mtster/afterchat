import React, { useEffect, useState } from 'react';
import { auth, updateUserProfile } from './services/firebase';
import { onAuthStateChanged, User, getRedirectResult } from 'firebase/auth';
import Login from './components/Login';
import Rooms from './components/Rooms';
import Profile from './components/Profile';
import ChatView from './components/ChatView';
import DebugConsole from './components/DebugConsole';
import { UserProfile } from './types'; 

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [view, setView] = useState<'rooms' | 'profile' | 'chat'>('rooms');
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);

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

  const userProfile: UserProfile | null = user ? {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL
  } : null;

  return (
    <div className="h-[100dvh] w-screen relative flex flex-col bg-black text-white overflow-hidden">
      {/* ALWAYS VISIBLE DEBUGGER */}
      <DebugConsole />
      
      {!userProfile ? (
        <Login />
      ) : (
        <>
          <main className="flex-1 overflow-hidden relative w-full h-full pt-safe-top">
              {view === 'rooms' && <Rooms onSelectRoom={(id) => { setActiveRoomId(id); setView('chat'); }} />}
              {view === 'chat' && activeRoomId && <ChatView roomId={activeRoomId} currentUser={userProfile} onBack={() => setView('rooms')} />}
              {view === 'profile' && <Profile user={userProfile} />}
          </main>

          {view !== 'chat' && (
              <nav className="h-20 bg-black/80 backdrop-blur-xl border-t border-zinc-800 flex justify-around items-start pt-3 pb-safe-bottom z-40 shrink-0">
              <button 
                  onClick={() => setView('rooms')}
                  className={`flex flex-col items-center gap-1 w-20 transition-all active:scale-95 ${
                  view === 'rooms' ? 'text-white' : 'text-zinc-600'
                  }`}
              >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={view === 'rooms' ? 2.5 : 2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                  </svg>
                  <span className="text-[10px] font-medium tracking-wide">Chats</span>
              </button>

              <button 
                  onClick={() => setView('profile')}
                  className={`flex flex-col items-center gap-1 w-20 transition-all active:scale-95 ${
                  view === 'profile' ? 'text-white' : 'text-zinc-600'
                  }`}
              >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={view === 'profile' ? 2.5 : 2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  <span className="text-[10px] font-medium tracking-wide">Profile</span>
              </button>
              </nav>
          )}
        </>
      )}
    </div>
  );
}