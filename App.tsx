import React, { useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth, onMessageListener } from './services/firebase';
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

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser: User | null) => {
      if (firebaseUser) {
        setUser({
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName,
          photoURL: firebaseUser.photoURL,
        });
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

  // Foreground Message Listener
  useEffect(() => {
    onMessageListener()
      .then((payload: any) => {
        // UI notification for foreground
        if(payload?.notification) {
            setNotification({
            title: payload.notification.title,
            body: payload.notification.body,
            });
            // Auto hide after 3 seconds
            setTimeout(() => setNotification({ title: '', body: '' }), 3000);
        }
      })
      .catch((err) => console.log('failed: ', err));
  }, []);

  const handleRoomSelect = (roomId: string) => {
    setActiveRoomId(roomId);
    setCurrentScreen(AppScreen.CHAT);
  };

  const handleBackFromChat = () => {
    setActiveRoomId(null);
    setCurrentScreen(AppScreen.ROOMS);
  };

  if (loadingAuth) return <div className="bg-black h-screen w-screen" />;

  if (!user) {
    return <Login />;
  }

  return (
    <div className="h-full w-full relative flex flex-col bg-black">
      {/* Foreground Notification Toast */}
      {notification.title && (
        <div className="fixed top-4 left-4 right-4 bg-zinc-800 border border-zinc-700 p-4 rounded-xl shadow-2xl z-50 animate-bounce">
          <p className="font-bold text-white text-sm">{notification.title}</p>
          <p className="text-zinc-400 text-xs">{notification.body}</p>
        </div>
      )}

      {/* Screen Router */}
      <main className="flex-1 overflow-hidden relative">
        {currentScreen === AppScreen.ROOMS && <Rooms onSelectRoom={handleRoomSelect} />}
        {currentScreen === AppScreen.PROFILE && <Profile user={user} />}
        {currentScreen === AppScreen.CHAT && activeRoomId && (
            <ChatView roomId={activeRoomId} currentUser={user} onBack={handleBackFromChat} />
        )}
      </main>

      {/* Bottom Navigation - Only show if not in Chat */}
      {currentScreen !== AppScreen.CHAT && (
        <nav className="h-20 bg-background/90 backdrop-blur-lg border-t border-border flex justify-around items-center pb-safe-bottom z-40">
          <button 
            onClick={() => setCurrentScreen(AppScreen.ROOMS)}
            className={`flex flex-col items-center gap-1 p-2 w-20 transition-colors ${
              currentScreen === AppScreen.ROOMS ? 'text-white' : 'text-zinc-600'
            }`}
          >
             <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={currentScreen === AppScreen.ROOMS ? 2.5 : 2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
             </svg>
             <span className="text-[10px] font-medium">Rooms</span>
          </button>

          <button 
            onClick={() => setCurrentScreen(AppScreen.PROFILE)}
            className={`flex flex-col items-center gap-1 p-2 w-20 transition-colors ${
              currentScreen === AppScreen.PROFILE ? 'text-white' : 'text-zinc-600'
            }`}
          >
             <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={currentScreen === AppScreen.PROFILE ? 2.5 : 2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
             </svg>
             <span className="text-[10px] font-medium">Profile</span>
          </button>
        </nav>
      )}
    </div>
  );
};

export default App;