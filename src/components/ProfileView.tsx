import React, { useState, useEffect } from 'react';
import { UserProfile, Roomer } from '../types';
import { updateUserProfile, auth, db, getRoomerDetails, deleteRoomer, getUserProfile, deleteUserAccount, googleProvider } from '../services/firebase';
import { ref, onValue } from 'firebase/database';
import { CURRENT_APP_VERSION } from '../version';
import { signInWithPopup, signInWithEmailAndPassword, reauthenticateWithPopup, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth';

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
  
  // Account Deletion States
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showReAuthModal, setShowReAuthModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [reAuthEmail, setReAuthEmail] = useState('');
  const [reAuthPass, setReAuthPass] = useState('');

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
        else setUsername('$');
    });
    const userRef = ref(db, `roomers/${currentUser.uid}`);
    const unsub = onValue(userRef, async (snapshot) => {
        const data = snapshot.val();
        if (data && data.addedRoomers) {
            const uids = Object.keys(data.addedRoomers);
            const details = await Promise.all(uids.map(uid => {
                 const val = data.addedRoomers[uid];
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

  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    // Strictly enforce starting with '$'
    if (!val.startsWith('$')) {
        // If user tries to delete the $, keep it there
        if (val.length < 1) setUsername('$');
        else setUsername('$' + val.replace(/^\$/, ''));
    } else {
        setUsername(val);
    }
  };

  const handleSaveUsername = async () => {
    setSaving(true);
    let term = username.trim();
    
    try {
        if (term === '$') {
            // User wants to delete username
             await updateUserProfile(currentUser.uid, { username: null });
             alert("Username removed.");
        } else {
             if (term.length < 3) throw new Error("Username too short.");
             await updateUserProfile(currentUser.uid, { username: term });
             alert("Username updated!");
        }
    } catch (e: any) {
        alert(e.message || "Failed to update.");
    }
    setSaving(false);
  };

  const handleDeleteRoomer = async (targetUid: string) => {
      if (window.confirm("Delete this roomer and all chat history?")) {
          await deleteRoomer(currentUser.uid, targetUid);
      }
  };

  const handleSignOut = () => {
    auth.signOut();
    window.location.reload();
  };

  // --- DELETE ACCOUNT LOGIC ---
  const attemptAccountDeletion = async () => {
      if (!auth.currentUser) return;
      setIsDeleting(true);
      try {
          await deleteUserAccount(auth.currentUser);
          // Redirect handled by onAuthStateChanged in App.tsx, but forcing reload ensures clean slate
          window.location.reload();
      } catch (error: any) {
          console.error("Deletion Error:", error.code);
          if (error.code === 'auth/requires-recent-login') {
              setShowDeleteConfirm(false);
              setShowReAuthModal(true);
          } else {
              alert("Could not delete account: " + error.message);
          }
      } finally {
          setIsDeleting(false);
      }
  };

  const handleReAuthenticateGoogle = async () => {
    if (!auth.currentUser) return;
    try {
        await reauthenticateWithPopup(auth.currentUser, googleProvider);
        setShowReAuthModal(false);
        // Retry deletion immediately
        attemptAccountDeletion();
    } catch (e: any) {
        alert("Authentication failed: " + e.message);
    }
  };

  const handleReAuthenticateEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;
    try {
        const cred = EmailAuthProvider.credential(reAuthEmail, reAuthPass);
        await reauthenticateWithCredential(auth.currentUser, cred);
        setShowReAuthModal(false);
        attemptAccountDeletion();
    } catch (e: any) {
        alert("Authentication failed: " + e.message);
    }
  };

  if (showSettings) {
      return (
        <div className="flex flex-col h-[100dvh] w-screen bg-background fixed inset-0 z-30">
            <div className="flex-none px-4 py-3 flex items-center border-b border-border bg-background z-40 sticky top-0" style={{ paddingTop: 'max(16px, env(safe-area-inset-top))' }}>
                <button onClick={() => setShowSettings(false)} className="flex items-center text-zinc-400 hover:text-white p-2 -ml-2"><svg className="w-6 h-6 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>Back</button>
                <span className="font-semibold text-lg flex-1 text-center pr-16">Settings</span>
            </div>
            <div className="flex-1 overflow-y-auto p-6 pb-20"><div className="flex items-center justify-between p-4 bg-zinc-900 rounded-xl border border-zinc-800"><span className="text-white font-medium">Dark Mode</span><button onClick={toggleTheme} className={`w-12 h-6 rounded-full p-1 transition-colors ${isDarkMode ? 'bg-blue-600' : 'bg-zinc-600'}`}><div className={`w-4 h-4 bg-white rounded-full shadow-md transform transition-transform ${isDarkMode ? 'translate-x-6' : 'translate-x-0'}`} /></button></div></div>
        </div>
      );
  }

  return (
    <div className={`flex flex-col h-[100dvh] w-screen bg-background z-30 fixed inset-0 transition-transform duration-300 ease-in-out ${isVisible ? 'translate-x-0' : 'translate-x-full'}`}>
       <div className="flex-none px-4 py-3 flex items-center border-b border-border bg-background/95 backdrop-blur-sm z-40 sticky top-0" style={{ paddingTop: 'max(16px, env(safe-area-inset-top))' }}>
        <button onClick={handleBack} className="text-zinc-400 hover:text-white mr-4 flex items-center gap-1 p-2 -ml-2 active:opacity-60"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg><span className="text-lg">Rooms</span></button>
        <span className="font-semibold text-lg flex-1 text-center pr-20">Profile</span>
      </div>

      <div className="flex-1 overflow-y-auto p-6 flex flex-col items-center no-scrollbar pb-20">
        <div className="w-24 h-24 rounded-full bg-zinc-800 mb-4 overflow-hidden border-2 border-zinc-800 shrink-0">
             {currentUser.photoURL ? <img src={currentUser.photoURL} alt="Me" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-zinc-600">?</div>}
        </div>
        <h2 className="text-xl font-bold text-white mb-1">{username === '$' ? (currentUser.displayName || 'No Username') : username}</h2>
        <p className="text-zinc-500 text-sm">{currentUser.email}</p>
        <div className="flex gap-3 mt-6 w-full max-w-xs shrink-0"><button onClick={() => setShowSettings(true)} className="flex-1 py-2 bg-zinc-800 rounded-lg text-sm font-medium">Settings</button></div>

        <div className="w-full max-md space-y-6 mt-8 shrink-0">
            <div>
                <label className="block text-xs font-bold text-zinc-500 uppercase mb-2 ml-1">Edit Username</label>
                <div className="flex gap-2 relative">
                    {/* Visual Lock for $ */}
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 select-none pointer-events-none z-10 font-bold">$</div>
                    <input 
                        type="text" 
                        value={username.substring(1)} // Display only the part after $
                        onChange={(e) => setUsername('$' + e.target.value)} 
                        className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl pl-8 pr-4 py-3 text-white focus:border-white transition-colors" 
                        placeholder="username"
                    />
                    <button onClick={handleSaveUsername} disabled={saving} className="bg-white text-black px-4 rounded-xl font-bold text-sm disabled:opacity-50">Save</button>
                </div>
                <p className="text-[10px] text-zinc-600 mt-1 ml-1">Clearing text and saving removes your username.</p>
            </div>
            <div>
                <label className="block text-xs font-bold text-zinc-500 uppercase mb-2 ml-1">My Roomers</label>
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden">
                    {myRoomers.length === 0 ? <div className="p-4 text-center text-zinc-600 text-sm">No active roomers.</div> : myRoomers.map(roomer => (
                        <div key={roomer.uid} className="flex items-center justify-between p-3 border-b border-zinc-800 last:border-0">
                            <div className="flex items-center gap-3 truncate">
                                <div className="w-8 h-8 rounded-full bg-zinc-700 overflow-hidden shrink-0">{roomer.photoURL && <img src={roomer.photoURL} className="w-full h-full object-cover"/>}</div>
                                <div className="truncate"><p className="text-white text-sm truncate">{roomer.displayName}</p></div>
                            </div>
                            <button onClick={() => handleDeleteRoomer(roomer.uid)} className="p-2 text-red-500 hover:bg-zinc-800 rounded-full"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                        </div>
                    ))}
                </div>
            </div>
            
            <div className="pt-8 border-t border-zinc-900 pb-2 space-y-3">
                <button onClick={handleSignOut} className="w-full py-4 font-medium bg-zinc-900/30 rounded-xl text-white">Sign Out</button>
                
                <button 
                    onClick={() => setShowDeleteConfirm(true)} 
                    className="w-full py-4 text-red-500 font-medium bg-red-950/20 rounded-xl hover:bg-red-900/30 transition-colors"
                >
                    Delete Account
                </button>
                
                {/* VERSION FOOTER */}
                <div className="w-full text-center pt-2">
                    <p className="text-zinc-600 text-xs font-mono">
                        Version {CURRENT_APP_VERSION}
                    </p>
                </div>
            </div>
        </div>
      </div>

      {/* DELETE CONFIRMATION MODAL */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-6">
            <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-6 w-full max-w-sm">
                <h2 className="text-xl font-bold text-white mb-2">Delete Account?</h2>
                <p className="text-zinc-400 text-sm mb-6">
                    This will <strong className="text-red-400">permanently delete</strong> your account, profile, and all chat history. This action cannot be undone.
                </p>
                <div className="flex gap-3">
                    <button 
                        onClick={() => setShowDeleteConfirm(false)}
                        className="flex-1 py-3 bg-zinc-900 rounded-xl text-white font-medium hover:bg-zinc-800"
                    >
                        Cancel
                    </button>
                    <button 
                        onClick={attemptAccountDeletion}
                        disabled={isDeleting}
                        className="flex-1 py-3 bg-red-600 rounded-xl text-white font-bold hover:bg-red-700 disabled:opacity-50"
                    >
                        {isDeleting ? 'Deleting...' : 'Proceed'}
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* RE-AUTH MODAL */}
      {showReAuthModal && (
        <div className="fixed inset-0 z-[60] bg-black/95 flex flex-col items-center justify-center p-6">
             <div className="w-full max-w-sm">
                <h2 className="text-2xl font-bold text-white mb-2 text-center">Verify Identity</h2>
                <p className="text-zinc-500 text-sm mb-8 text-center">Please sign in again to confirm account deletion.</p>

                <div className="space-y-4">
                     <button 
                        onClick={handleReAuthenticateGoogle}
                        className="w-full bg-zinc-800 text-white font-medium h-12 rounded-xl active:scale-95 transition-transform flex items-center justify-center gap-2 border border-zinc-700"
                    >
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                        <span>Verify with Google</span>
                    </button>
                    
                    <div className="flex items-center w-full">
                        <div className="flex-1 h-px bg-zinc-800"></div>
                        <span className="px-3 text-xs text-zinc-600 uppercase">Or</span>
                        <div className="flex-1 h-px bg-zinc-800"></div>
                    </div>

                    <form onSubmit={handleReAuthenticateEmail} className="flex flex-col gap-3">
                        <input type="email" value={reAuthEmail} onChange={e=>setReAuthEmail(e.target.value)} placeholder="Email" className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white" required />
                        <input type="password" value={reAuthPass} onChange={e=>setReAuthPass(e.target.value)} placeholder="Password" className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white" required />
                        <button type="submit" className="w-full bg-white text-black font-bold h-12 rounded-xl mt-2">Verify & Delete</button>
                    </form>
                    
                    <button onClick={() => setShowReAuthModal(false)} className="w-full py-2 text-zinc-500 text-sm mt-4">Cancel</button>
                </div>
             </div>
        </div>
      )}
    </div>
  );
}