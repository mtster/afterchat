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

// Environment Detection Logic
const LIVE_PRODUCTION_URL = 'afterchat.vercel.app';
const isLiveSite = typeof window !== 'undefined' && window.location.hostname === LIVE_PRODUCTION_URL;

if (typeof window !== 'undefined') {
  console.log('Current Hostname:', window.location.hostname);
  console.log('Environment Mode:', isLiveSite ? 'PRODUCTION (Debug Hidden)' : 'DEVELOPMENT (Debug Active)');
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [view, setView] = useState<AppView>(() => {
    try {
        const saved = localStorage.getItem('rooms_app_view');
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
    localStorage.setItem('rooms_app_view', JSON.stringify(view));
    viewRef.current = view;
  }, [view]);

  // Central Auth & Profile Sync Logic
  useEffect(() => {
    let unsubscribe: () => void;
    const initAuth = async () => {
        try {
            await setPersistence(auth, browserLocalPersistence);
            
            try {
                const result = await getRedirectResult(auth);
                if (result?.user) {
                    await updateUserProfile(result.user.uid, {
                        email: result.user.email,
                        displayName: result.user.displayName,
                        photoURL: result.user.photoURL,
                        lastOnline: Date.now()
                    });
                }
            } catch (e) {}

            unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
                if (currentUser) {
                    setUser(currentUser);
                    setLoadingAuth(false);
                    updateUserProfile(currentUser.uid, {
                        email: currentUser.email,
                        displayName: currentUser.displayName || currentUser.email?.split('@')[0] || 'User',
                        photoURL: currentUser.photoURL,
                        lastOnline: Date.now()
                    }).catch(() => {});
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
        const currentView = viewRef.current;
        const roomId = payload.data?.roomId || "";
        const isChattingWithSender = currentView.name === 'CHAT' && currentView.roomId === roomId;
        
        if (!isChattingWithSender && Notification.permission === 'granted') {
            const title = payload.notification?.title || payload.data?.title || "New Message";
            const body = payload.notification?.body || payload.data?.body || "";
            new Notification(title, { body, icon: '/icon-192.png' });
        }
    });

    return () => { if (unsubscribe) unsubscribe(); };
  }, []);

  // Roomers Data Fetching WITH CACHING
  useEffect(() => {
    if (!user) {
        setRoomers([]);
        setLoadingRoomers(false);
        return;
    }

    const CACHE_KEY = `roomers_list_cache_${user.uid}`;
    
    // 1. Instant Load from Cache
    try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
            const parsed = JSON.parse(cached);
            setRoomers(parsed);
            setLoadingRoomers(false);
            console.log(`[DB_OPTIMIZATION] Loaded ${parsed.length} roomers from Local Cache.`);
        }
    } catch (e) { console.warn("Failed to load roomers cache"); }

    const userRef = ref(db, `roomers/${user.uid}`);
    
    // 2. Background Sync
    const unsub = onValue(userRef, async (snapshot) => {
      const data = snapshot.val();
      const allRoomers: Roomer[] = [];
      
      console.log("[DB_OPTIMIZATION] Fetching updated Roomers List from Network...");
      
      if (data) {
        if (data.addedRoomers) {
             const addedUids = Object.keys(data.addedRoomers);
             const addedDetails = await Promise.all(addedUids.map(async (uid) => {
                 const statusVal = data.addedRoomers[uid];
                 const status = statusVal === 'accepted' ? 'accepted' : 'pending_outgoing';
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
      
      // Update State & Cache
      setRoomers(unique);
      setLoadingRoomers(false);
      localStorage.setItem(CACHE_KEY, JSON.stringify(unique));
      console.log(`[DB_OPTIMIZATION] Network Sync Complete. Cached ${unique.length} roomers.`);
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
            <p className="text-zinc-500 text-xs font-mono uppercase tracking-widest">Rooms Authenticating...</p>
        </div>
      );
  }

  return (
    <div className={`w-screen h-[100dvh] relative flex flex-col overflow-hidden ${isDarkMode ? 'bg-black text-white' : 'bg-gray-100 text-black'}`}>
      {!isLiveSite && <DebugConsole />}
      
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