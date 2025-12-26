import React, { useState, useEffect } from 'react';
import { UserProfile, Roomer } from '../types';
import { updateUserProfile, auth, db, getRoomerDetails, deleteRoomer, getUserProfile } from '../services/firebase';
import { ref, onValue } from 'firebase/database';

interface Props {
  currentUser: UserProfile;
  onBack: () => void;
  toggleTheme: () => void;
  isDarkMode: boolean;
}

export default function ProfileView({ currentUser, onBack, toggleTheme, isDarkMode }: Props) {
  const [username, setUsername] = useState('$');
  const [saving, setSaving] = useState(false);
  const [myRoomers, setMyRoomers] = useState<Roomer[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 10);
    return () => clearTimeout(timer);
  }, []);

  const handleBack = () => {
    setIsVisible(false);
    setTimeout(onBack, 300);
  };

  useEffect(() => {
    getUserProfile(currentUser.uid).then(p => {
        if (p && p.username) setUsername(p.username);
    });
    const userRef = ref(db, `users/${currentUser.uid}`);
    const unsub = onValue(userRef, async (snapshot) => {
        const data = snapshot.val();
        if (data && data.addedUsers) {
            const uids = Object.keys(data.addedUsers);
            const details = await Promise.all(uids.map(uid => {
                 const val = data.addedUsers[uid];
                 const status = val === 'accepted' ? 'accepted' : 'pending_outgoing';
                 return getRoomerDetails(uid, status);
            }));
            setMyRoomers(details.filter(r => r !== null) as Roomer[]);
        } else {
            setMyRoomers([]);
        }
    });
    return () => unsub();
  }, [currentUser.uid]);

  const handleSaveUsername = async () => {
    let term = username.trim();
    if (!term.startsWith('$')) term = '$' + term;
    if (term.length < 2) return alert("Username too short.");
    
    setSaving(true);
    try {
        await updateUserProfile(currentUser.uid, { username: term });
        setUsername(term);
        alert("Username updated!");
    } catch (e) {
        alert("Failed to update.");
    }
    setSaving(false);
  };

  const handleDeleteRoomer = async (targetUid: string) => {
      if (window.confirm("Delete this chat?")) {
          await deleteRoomer(currentUser.uid, targetUid);
      }
  };

  const handleSignOut = () => {
    auth.signOut();
    window.location.reload();
  };

  if (showSettings) {
      return (
        <div className="flex flex-col h-[100dvh] w-screen bg-background fixed inset-0 z-30">
            <div 
                className="flex-none px-4 py-3 flex items-center border-b border-border bg-background z-40 sticky top-0"
                style={{ paddingTop: 'max(16px, env(safe-area-inset-top))' }}
            >
                <button onClick={() => setShowSettings(false)} className="flex items-center text-zinc-400 hover:text-white p-2 -ml-2">
                    <svg className="w-6 h-6 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                    Back
                </button>
                <span className="font-semibold text-lg flex-1 text-center pr-16">Settings</span>
            </div>
            <div className="flex-1 overflow-y-auto p-6 no-scrollbar pb-20">
                <div className="flex items-center justify-between p-4 bg-zinc-900 rounded-xl border border-zinc-800">
                    <span className="text-white font-medium">Dark Mode</span>
                    <button 
                        onClick={toggleTheme}
                        className={`w-12 h-6 rounded-full p-1 transition-colors ${isDarkMode ? 'bg-blue-600' : 'bg-zinc-600'}`}
                    >
                        <div className={`w-4 h-4 bg-white rounded-full shadow-md transform transition-transform ${isDarkMode ? 'translate-x-6' : 'translate-x-0'}`} />
                    </button>
                </div>
            </div>
        </div>
      );
  }

  return (
    <div 
        className={`flex flex-col h-[100dvh] w-screen bg-background z-30 fixed inset-0 transition-transform duration-300 ease-in-out ${isVisible ? 'translate-x-0' : 'translate-x-full'}`}
    >
       {/* Header */}
       <div 
         className="flex-none px-4 py-3 flex items-center border-b border-border bg-background/95 backdrop-blur-sm z-40 sticky top-0"
         style={{ paddingTop: 'max(16px, env(safe-area-inset-top))' }}
       >
        <button onClick={handleBack} className="text-zinc-400 hover:text-white mr-4 flex items-center gap-1 p-2 -ml-2 active:opacity-60">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            <span className="text-lg">Rooms</span>
        </button>
        <span className="font-semibold text-lg flex-1 text-center pr-20">Profile</span>
      </div>

      <div className="flex-1 overflow-y-auto p-6 flex flex-col items-center no-scrollbar pb-20">
        <div className="w-24 h-24 rounded-full bg-zinc-800 mb-4 overflow-hidden border-2 border-zinc-800 shrink-0">
             {currentUser.photoURL ? (
                <img src={currentUser.photoURL} alt="Me" className="w-full h-full object-cover" />
             ) : (
                <div className="w-full h-full flex items-center justify-center">
                    <svg className="w-12 h-12 text-zinc-600" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" /></svg>
                </div>
             )}
        </div>

        <h2 className="text-xl font-bold text-white mb-1">{username}</h2>
        <p className="text-zinc-500 text-sm">{currentUser.email}</p>
        <p className="text-blue-500 text-xs font-bold mt-2 uppercase tracking-wide">
            {myRoomers.length} Active Roomer{myRoomers.length !== 1 && 's'}
        </p>

        <div className="flex gap-3 mt-6 w-full max-w-xs shrink-0">
            <button 
                onClick={() => setShowSettings(true)}
                className="flex-1 py-2 bg-zinc-800 rounded-lg text-sm font-medium hover:bg-zinc-700 transition-colors"
            >
                Settings
            </button>
        </div>

        <div className="w-full max-w-md space-y-6 mt-8 shrink-0">
            <div>
                <label className="block text-xs font-bold text-zinc-500 uppercase mb-2 ml-1">Edit Username</label>
                <div className="flex gap-2">
                    <input 
                        type="text" 
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:border-white focus:outline-none transition-colors"
                        placeholder="$Username"
                    />
                    <button 
                        onClick={handleSaveUsername}
                        disabled={saving}
                        className="bg-white text-black px-4 rounded-xl font-bold text-sm disabled:opacity-50"
                    >
                        Save
                    </button>
                </div>
            </div>

            <div>
                <label className="block text-xs font-bold text-zinc-500 uppercase mb-2 ml-1">My Roomers (People I Added)</label>
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden">
                    {myRoomers.length === 0 ? (
                        <div className="p-4 text-center text-zinc-600 text-sm">No active roomers.</div>
                    ) : (
                        myRoomers.map(roomer => (
                            <div key={roomer.uid} className="flex items-center justify-between p-3 border-b border-zinc-800 last:border-0">
                                <div className="flex items-center gap-3 overflow-hidden">
                                    <div className="w-8 h-8 rounded-full bg-zinc-700 overflow-hidden shrink-0">
                                        {roomer.photoURL && <img src={roomer.photoURL} className="w-full h-full object-cover"/>}
                                    </div>
                                    <div className="truncate">
                                        <p className="text-white text-sm truncate">{roomer.displayName}</p>
                                        <p className="text-zinc-500 text-[10px] truncate">{roomer.email}</p>
                                    </div>
                                </div>
                                <button 
                                    onClick={() => handleDeleteRoomer(roomer.uid)}
                                    className="p-2 text-red-500 hover:bg-zinc-800 rounded-full"
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                </button>
                            </div>
                        ))
                    )}
                </div>
            </div>

            <div className="pt-8 border-t border-zinc-900 pb-10">
                <button 
                    onClick={handleSignOut}
                    className="w-full py-4 text-red-500 font-medium bg-zinc-900/30 rounded-xl hover:bg-zinc-900 transition-colors"
                >
                    Sign Out
                </button>
            </div>
        </div>
      </div>
    </div>
  );
}