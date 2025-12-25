import React, { useEffect, useState } from 'react';
import { onAuthStateChanged, User, getRedirectResult } from 'firebase/auth';
import { auth, onMessageListener, updateUserProfile } from './services/firebase';
import { AppScreen, UserProfile } from './types';
import Login from './components/Login';
import Rooms from './components/Rooms';
import Profile from './components/Profile';
import ChatView from './components/ChatView';

const App: React.FC = () => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [currentScreen, setCurrentScreen] = useState<AppScreen>(AppScreen.LOGIN);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  
  // Foreground Notification State
  const [notification, setNotification] = useState({ title: '', body: '' });

  // 0. Handle Redirect Result (Runs on mount)
  // This is crucial for the iOS PWA flow where we use signInWithRedirect
  useEffect(() => {
    const handleRedirectResult = async () => {
      try {
        const result = await getRedirectResult(auth);
        if (result && result.user) {
          // Update user profile in DB after a successful redirect login
          updateUserProfile(result.user.uid, {
            email: result.user.email,
            displayName: result.user.displayName,
            photoURL: result.user.photoURL,
            lastOnline: Date.now()
          });
        }
      } catch (error) {
        console.error("Error handling redirect result:", error);
      }
    };
    handleRedirectResult();
  }, []);

  // 1. Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser: User | null) => {
      if (firebaseUser) {
        setUser({
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName,
          photoURL: firebaseUser.photoURL,
        });
        // If we were on login, go to rooms. Otherwise stay where we are (e.g. refresh)
        if (currentScreen === AppScreen.LOGIN) {
            setCurrentScreen(AppScreen.ROOMS);
        }
      } else {
        setUser(null);
        setCurrentScreen(AppScreen.LOGIN);
      }
      setLoadingAuth(false);
    });
    return () => unsubscribe();
  }, [currentScreen]);

  // 2. Foreground Message Listener
  useEffect(() => {
    onMessageListener()
      .then((payload: any) => {
        if(payload?.notification) {
            setNotification({
              title: payload.notification.title,
              body: payload.notification.body,
            });
            setTimeout(() => setNotification({ title: '', body: '' }), 5000);
        }
      })
      .catch((err) => console.log('Message listener failed: ', err));
  }, []);

  const handleRoomSelect = (roomId: string) => {
    setActiveRoomId(roomId);
    setCurrentScreen(AppScreen.CHAT);
  };

  const handleBackFromChat = () => {
    setActiveRoomId(null);
    setCurrentScreen(AppScreen.ROOMS);
  };

  // 3. Loading State (Prevents flicker)
  if (loadingAuth) {
    return (
      <div className="flex items-center justify-center h-screen w-screen bg-black text-white">
        <div className="animate-pulse flex flex-col items-center">
           <div className="h-8 w-8 bg-zinc-800 rounded-full mb-4"></div>
        </div>
      </div>
    );
  }

  // 4. Login Screen
  if (!user) {
    return <Login />;
  }

  // 5. Main App Layout
  return (
    <div className="h-[100dvh] w-screen relative flex flex-col bg-black text-white overflow-hidden">
      
      {/* Toast Notification */}
      {notification.title && (
        <div className="fixed top-safe-top mt-4 left-4 right-4 bg-zinc-800/90 backdrop-blur-md border border-zinc-700 p-4 rounded-xl shadow-2xl z-[100] animate-bounce">
          <p className="font-bold text-white text-sm">{notification.title}</p>
          <p className="text-zinc-400 text-xs">{notification.body}</p>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 overflow-hidden relative w-full h-full pt-safe-top">
        {currentScreen === AppScreen.ROOMS && <Rooms onSelectRoom={handleRoomSelect} />}
        {currentScreen === AppScreen.PROFILE && <Profile user={user} />}
        {currentScreen === AppScreen.CHAT && activeRoomId && (
            <ChatView roomId={activeRoomId} currentUser={user} onBack={handleBackFromChat} />
        )}
      </main>

      {/* Tab Bar - Only show if NOT in Chat */}
      {currentScreen !== AppScreen.CHAT && (
        <nav className="h-20 bg-black/80 backdrop-blur-xl border-t border-zinc-800 flex justify-around items-start pt-3 pb-safe-bottom z-40 shrink-0">
          <button 
            onClick={() => setCurrentScreen(AppScreen.ROOMS)}
            className={`flex flex-col items-center gap-1 w-20 transition-all active:scale-95 ${
              currentScreen === AppScreen.ROOMS ? 'text-white' : 'text-zinc-600'
            }`}
          >
             <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={currentScreen === AppScreen.ROOMS ? 2.5 : 2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
             </svg>
             <span className="text-[10px] font-medium tracking-wide">Chats</span>
          </button>

          <button 
            onClick={() => setCurrentScreen(AppScreen.PROFILE)}
            className={`flex flex-col items-center gap-1 w-20 transition-all active:scale-95 ${
              currentScreen === AppScreen.PROFILE ? 'text-white' : 'text-zinc-600'
            }`}
          >
             <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={currentScreen === AppScreen.PROFILE ? 2.5 : 2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
             </svg>
             <span className="text-[10px] font-medium tracking-wide">Profile</span>
          </button>
        </nav>
      )}
    </div>
  );
};

export default App;