import React, { useEffect, useState, useRef } from 'react';
import { auth, updateUserProfile, requestAndStoreToken, onMessageListener, db, getRoomerDetails } from './services/firebase';
import { onAuthStateChanged, User, getRedirectResult, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { ref, onValue } from 'firebase/database';
import Login from './components/Login';
import ChatView from './components/ChatView';
import RoomsList from './components/RoomsList';
import ProfileView from './components/ProfileView';
import DebugConsole from './components/DebugConsole';
import { UserProfile, AppView, Roomer } from './types'; 

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [view, setView] = useState<AppView>(() => {
    try {
        const saved = localStorage.getItem('onyx_app_view');
        return saved ? JSON.parse(saved) : { name: 'ROOMS_LIST' };
    } catch (e) {
        return { name: 'ROOMS_LIST' };
    }
  });

  const [roomers, setRoomers] = useState<Roomer[]>([]);
  const [loadingRoomers, setLoadingRoomers] = useState(true);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const viewRef = useRef<AppView>(view);

  useEffect(() => {
    localStorage.setItem('onyx_app_view', JSON.stringify(view));
    viewRef.current = view;
  }, [view]);

  // Auth & Notifications Logic
  useEffect(() => {
    let unsubscribe: () => void;
    const initAuth = async () => {
        try {
            await setPersistence(auth, browserLocalPersistence);
            try {
                const result = await getRedirectResult(auth);
                if (result?.user) {
                    setUser(result.user);
                    updateUserProfile(result.user.uid, {
                        email: result.user.email,
                        displayName: result.user.displayName,
                        photoURL: result.user.photoURL,
                        lastOnline: Date.now()
                    });
                    requestAndStoreToken(result.user.uid);
                }
            } catch (e) {}

            unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
                if (currentUser) {
                    setUser(currentUser);
                    setLoadingAuth(false);
                    requestAndStoreToken(currentUser.uid);
                } else {
                    setUser(null);
                    setLoadingAuth(false);
                }
            });
        } catch (error) {
            setLoadingAuth(false);
        }
    };
    initAuth();
    
    onMessageListener((payload) => {
        let title = "New Message";
        let body = "You have a new message";
        let roomId = "";

        if (payload.notification) {
            title = payload.notification.title || title;
            body = payload.notification.body || body;
        }
        if (payload.data) {
            if (payload.data.roomId) roomId = payload.data.roomId;
            if (!payload.notification) {
                title = payload.data.title || title;
                body = payload.data.body || body;
            }
        }
        const currentView = viewRef.current;
        const isChattingWithSender = currentView.name === 'CHAT' && currentView.roomId === roomId;
        if (!isChattingWithSender && Notification.permission === 'granted') {
            new Notification(title, { body, icon: '/icon-192.png' });
        }
    });

    return () => { if (unsubscribe) unsubscribe(); };
  }, []);

  // Roomers Data Fetching (Cached at App level)
  useEffect(() => {
    if (!user) {
        setRoomers([]);
        setLoadingRoomers(false);
        return;
    }

    const userRef = ref(db, `roomers/${user.uid}`);
    const unsub = onValue(userRef, async (snapshot) => {
      const data = snapshot.val();
      const allRoomers: Roomer[] = [];
      if (data) {
        if (data.addedRoomers) {
             const addedUids = Object.keys(data.addedRoomers);
             const addedDetails = await Promise.all(addedUids.map(async (uid) => {
                 const val = data.addedRoomers[uid];
                 const status = val === 'accepted' ? 'accepted' : 'pending_outgoing';
                 return getRoomerDetails(uid, status);
             }));
             allRoomers.push(...addedDetails.filter(r => r !== null) as Roomer[]);
        }
        if (data.pendingApprovals) {
            const pendingUids = Object.keys(data.pendingApprovals);
            const pendingDetails = await Promise.all(pendingUids.map(uid => getRoomerDetails(uid, 'pending_incoming')));
            allRoomers.push(...pendingDetails.filter(r => r !== null) as Roomer[]);
        }
      }
      const unique = Array.from(new Map(allRoomers.map(item => [item.uid, item])).values());
      setRoomers(unique);
      setLoadingRoomers(false);
    });

    return () => unsub();
  }, [user]);

  const toggleTheme = () => {
      setIsDarkMode(!isDarkMode);
      if (isDarkMode) document.documentElement.classList.remove('dark');
      else document.documentElement.classList.add('dark');
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

  if (loadingAuth) {
      return (
        <div className="h-[100dvh] w-screen bg-black flex flex-col items-center justify-center gap-4">
            <div className="w-12 h-12 rounded-full border-2 border-zinc-800 border-t-white animate-spin" />
            <p className="text-zinc-500 text-xs font-mono">AUTHENTICATING...</p>
        </div>
      );
  }

  return (
    <div className={`w-screen h-[100dvh] relative flex flex-col overflow-hidden ${isDarkMode ? 'bg-black text-white' : 'bg-gray-100 text-black'}`}>
      <DebugConsole />
      <div className="flex-1 w-full h-full relative z-10 flex flex-col">
        {!userProfile ? ( <Login /> ) : (
          <>
            {view.name === 'ROOMS_LIST' && (
              <RoomsList 
                currentUser={userProfile} 
                roomers={roomers}
                loading={loadingRoomers}
                onNavigateChat={handleNavigateChat}
                onNavigateProfile={() => setView({ name: 'PROFILE' })}
              />
            )}
            {view.name === 'CHAT' && (
              <ChatView 
                roomId={view.roomId} 
                recipient={view.recipient}
                currentUser={userProfile} 
                onBack={() => setView({ name: 'ROOMS_LIST' })} 
              />
            )}
            {view.name === 'PROFILE' && (
              <ProfileView 
                currentUser={userProfile}
                onBack={() => setView({ name: 'ROOMS_LIST' })}
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