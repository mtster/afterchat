import React, { useEffect, useState, useRef } from 'react';
import { auth, updateUserProfile, requestAndStoreToken, onMessageListener, db, getRoomerDetails } from './services/firebase';
import { onAuthStateChanged, User, getRedirectResult, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { ref, onValue, update } from 'firebase/database';
import Login from './components/Login';
import ChatView from './components/ChatView';
import RoomsList from './components/RoomsList';
import ProfileView from './components/ProfileView';
import DebugConsole from './components/DebugConsole';
import { UserProfile, AppView, Roomer } from './types'; 
import { CURRENT_APP_VERSION } from './version';
import { checkVersion, compareVersions } from './services/versionCheck';
import { X, CheckCircle, Loader2 } from 'lucide-react';

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
  
  // Update System State
  const [isInstallingUpdate, setIsInstallingUpdate] = useState(false);
  const [showUpdateSuccess, setShowUpdateSuccess] = useState(false);
  
  const viewRef = useRef<AppView>(view);
  const lastRoomersSnapshotRef = useRef<string>('');

  useEffect(() => {
    localStorage.setItem('rooms_app_view', JSON.stringify(view));
    viewRef.current = view;
  }, [view]);

  // --- VERSION CHECK & UPDATE LOGIC ---
  useEffect(() => {
    const performUpdateSequence = async (remoteVersion: string) => {
        console.log(`[Update_System] Starting update sequence to ${remoteVersion}...`);
        setIsInstallingUpdate(true);
        
        // 1. Trigger SW Update
        if ('serviceWorker' in navigator) {
            try {
                const reg = await navigator.serviceWorker.getRegistration();
                if (reg) {
                    console.log("[Update_System] Sending SKIP_WAITING to SW...");
                    if (reg.waiting) {
                        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
                    }
                    await reg.update();
                    console.log("[Update_System] SW Registration Updated.");
                }
            } catch (e) {
                console.error("[Update_System] SW Update failed:", e);
            }
        }

        // 2. Clear Caches (Optional safety net)
        if ('caches' in window) {
            try {
                const keys = await caches.keys();
                await Promise.all(keys.map(key => caches.delete(key)));
                console.log("[Update_System] Browser Caches Cleared.");
            } catch (e) {
                console.error("[Update_System] Cache clear failed:", e);
            }
        }

        // 3. Force Reload
        console.log("[Update_System] Reloading window in 1.5s...");
        setTimeout(() => {
            window.location.reload();
        }, 1500);
    };

    const runCheck = async () => {
        console.log("[Update_System] Checking for updates...");
        const { hasUpdate, remoteVersion } = await checkVersion();
        
        if (hasUpdate) {
            console.log(`[Update_System] CRITICAL: Update found! ${CURRENT_APP_VERSION} -> ${remoteVersion}`);
            performUpdateSequence(remoteVersion);
        } else {
            console.log("[Update_System] App is up to date.");
        }
    };

    // Check on mount
    runCheck();

    // Check on focus
    const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
            console.log("[Update_System] App focused. Re-checking version...");
            runCheck();
        }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // --- SUCCESS POPUP LOGIC ---
    // Check if we just updated
    const lastVersion = localStorage.getItem('rooms_cached_version');
    console.log(`[Update_System] Previous stored version: ${lastVersion}, Current: ${CURRENT_APP_VERSION}`);
    
    if (!lastVersion) {
        // First run ever
        localStorage.setItem('rooms_cached_version', CURRENT_APP_VERSION);
    } else if (compareVersions(CURRENT_APP_VERSION, lastVersion) > 0) {
        // We have updated!
        console.log("[Update_System] Update Success detected!");
        setShowUpdateSuccess(true);
    }

    return () => {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const dismissUpdateSuccess = () => {
      setShowUpdateSuccess(false);
      localStorage.setItem('rooms_cached_version', CURRENT_APP_VERSION);
      console.log(`[Update_System] Version ${CURRENT_APP_VERSION} acknowledged and stored.`);
  };

  // PRESENCE HEARTBEAT (Update lastOnline every 15s)
  useEffect(() => {
    if (!user) return;
    const heartbeat = setInterval(() => {
        if (document.visibilityState === 'visible') {
            // We use update (not set) to avoid overwriting other fields
            update(ref(db, `roomers/${user.uid}`), { lastOnline: Date.now() }).catch(() => {});
        }
    }, 15000); // 15 seconds
    
    return () => clearInterval(heartbeat);
  }, [user]);

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
        
        // Safety check for Notification API
        const hasNotification = typeof window !== 'undefined' && 'Notification' in window;
        // @ts-ignore
        const permission = hasNotification ? Notification.permission : 'default';

        if (!isChattingWithSender && permission === 'granted') {
            const title = payload.notification?.title || payload.data?.title || "New Message";
            const body = payload.notification?.body || payload.data?.body || "";
            // @ts-ignore
            new Notification(title, { body, icon: '/icon-192.png' });
        }
    });

    return () => { if (unsubscribe) unsubscribe(); };
  }, []);

  // Roomers Data Fetching WITH CACHING & OPTIMIZATION
  useEffect(() => {
    if (!user) {
        setRoomers([]);
        setLoadingRoomers(false);
        lastRoomersSnapshotRef.current = '';
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
    
    // 2. Background Sync with Diff Check
    const unsub = onValue(userRef, async (snapshot) => {
      const data = snapshot.val();
      
      const syncSignature = JSON.stringify({
          added: data?.addedRoomers,
          pending: data?.pendingApprovals
      });

      if (syncSignature === lastRoomersSnapshotRef.current) {
          return;
      }
      
      lastRoomersSnapshotRef.current = syncSignature;
      console.log("[DB_OPTIMIZATION] Fetching updated Roomers List from Network...");
      
      const allRoomers: Roomer[] = [];
      
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
      
      {/* 1. Installing Overlay */}
      {isInstallingUpdate && (
          <div className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center p-6 animate-in fade-in duration-300">
              <div className="flex flex-col items-center gap-6">
                 <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
                 <div className="text-center">
                    <h2 className="text-xl font-bold text-white mb-2">Installing Update...</h2>
                    <p className="text-zinc-500 text-sm">Getting the latest version of Rooms.</p>
                 </div>
              </div>
          </div>
      )}

      {/* 2. Success Popup */}
      {showUpdateSuccess && !isInstallingUpdate && (
          <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 w-full max-w-sm px-4 animate-in slide-in-from-bottom-4 fade-in duration-500">
              <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-4 shadow-2xl flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-green-900/30 flex items-center justify-center text-green-500">
                          <CheckCircle size={20} />
                      </div>
                      <div>
                          <h3 className="font-bold text-sm text-white">App Updated</h3>
                          <p className="text-xs text-zinc-400">Now running version {CURRENT_APP_VERSION}</p>
                      </div>
                  </div>
                  <button onClick={dismissUpdateSuccess} className="p-2 text-zinc-500 hover:text-white rounded-full bg-zinc-800/50">
                      <X size={16} />
                  </button>
              </div>
          </div>
      )}
      
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