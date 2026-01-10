import React, { useEffect, useState } from 'react';
import { db, findUserByEmailOrUsername, addRoomerToUser, setupNotifications } from '../services/firebase';
import { ref, onValue } from 'firebase/database';
import { UserProfile, Roomer } from '../types';
import { Bell, Plus, UserCircle } from 'lucide-react';
import { approveRoomer, deleteRoomer } from '../services/firebase';

interface Props {
  currentUser: UserProfile;
  roomers: Roomer[];
  loading: boolean;
  onNavigateChat: (roomer: Roomer) => void;
  onNavigateProfile: () => void;
}

export default function RoomsList({ currentUser, roomers, loading, onNavigateChat, onNavigateProfile }: Props) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResult, setSearchResult] = useState<Roomer | null>(null);
  const [searchError, setSearchError] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [hasFcmToken, setHasFcmToken] = useState(false);

  // Sync Bell Icon with Database in real-time
  useEffect(() => {
    const tokenRef = ref(db, `roomers/${currentUser.uid}/fcmToken`);
    const unsub = onValue(tokenRef, (snap) => {
      setHasFcmToken(!!snap.val());
    });
    return () => unsub();
  }, [currentUser.uid]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setSearchError('');
    setSearchResult(null);
    let term = searchTerm.trim();
    if (!term) return;

    try {
      const result = await findUserByEmailOrUsername(term);
      if (result) {
        if (result.uid === currentUser.uid) {
            setSearchError("You cannot add yourself.");
        } else {
            const exists = roomers.find(r => r.uid === result.uid);
            if (exists) {
                setSearchError("User already in your rooms.");
            } else {
                setSearchResult(result);
                console.log("[Search] Result found:", result.displayName);
            }
        }
      } else {
        setSearchError('User not found.');
      }
    } catch (err: any) {
      setSearchError("Search failed.");
    }
  };

  const handleAddUser = async () => {
    if (!searchResult) return;
    setIsProcessing(true);
    try {
      await addRoomerToUser(currentUser.uid, searchResult.uid);
      setShowAddModal(false);
      setSearchTerm('');
      setSearchResult(null);
    } catch (err: any) {
      alert("Could not add user.");
    }
    setIsProcessing(false);
  };

  const handleNotificationClick = async () => {
      await setupNotifications(currentUser.uid);
  };

  return (
    <div className="flex flex-col w-full h-full bg-background overflow-hidden">
      <div className="flex-none px-4 pb-3 flex items-center justify-between bg-zinc-900/50 backdrop-blur-md border-b border-zinc-800 sticky top-0 z-10" style={{ paddingTop: 'max(16px, env(safe-area-inset-top))' }}>
        <h1 className="text-2xl font-bold text-white tracking-tight">Rooms</h1>
        <div className="flex items-center gap-3">
          <button onClick={handleNotificationClick} className={`w-8 h-8 flex items-center justify-center rounded-full bg-zinc-800 hover:bg-zinc-700 active:scale-95 transition-all ${hasFcmToken ? 'text-green-500' : 'text-zinc-500'}`}>
            <Bell size={18} />
          </button>
          <button onClick={() => setShowAddModal(true)} className="w-8 h-8 flex items-center justify-center rounded-full bg-zinc-800 hover:bg-zinc-700 active:scale-95 transition-all text-zinc-300">
            <Plus size={18} />
          </button>
          <button onClick={onNavigateProfile} className="w-8 h-8 rounded-full overflow-hidden border border-zinc-700 active:scale-95 transition-transform">
             {currentUser.photoURL ? (
               <img src={currentUser.photoURL} alt="Me" className="w-full h-full object-cover" />
             ) : (
               <div className="w-full h-full bg-zinc-800 flex items-center justify-center text-zinc-500"><UserCircle size={18} /></div>
             )}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar p-4 pb-20">
        {loading ? (
           <div className="flex justify-center mt-10 text-zinc-600 text-sm">Loading...</div>
        ) : roomers.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[60%] text-center px-6">
            <h3 className="text-white font-medium mb-1">No Rooms Yet</h3>
            <p className="text-zinc-500 text-sm mb-6">Add people to start chatting.</p>
            <button onClick={() => setShowAddModal(true)} className="px-6 py-2 bg-white text-black text-sm font-semibold rounded-full active:scale-95 transition-transform">Add Roomer</button>
          </div>
        ) : (
          <div className="space-y-1">
            {roomers.map(roomer => {
                const isIncoming = roomer.status === 'pending_incoming';
                const isPending = roomer.status === 'pending_incoming' || roomer.status === 'pending_outgoing';
                return (
                  <button key={roomer.uid} onClick={() => onNavigateChat(roomer)} className={`w-full flex items-center gap-4 p-3 rounded-xl transition-colors active:bg-zinc-900 ${isPending ? 'bg-zinc-900/20 opacity-70' : 'hover:bg-zinc-900/50'}`}>
                    <div className={`w-12 h-12 rounded-full overflow-hidden flex-shrink-0 border border-zinc-700`}>
                      {roomer.photoURL ? <img src={roomer.photoURL} className="w-full h-full object-cover" /> : <div className="w-full h-full bg-zinc-800 flex items-center justify-center text-zinc-500">?</div>}
                    </div>
                    <div className="flex-1 text-left min-w-0">
                        <h3 className={`font-medium truncate ${isPending ? 'text-zinc-400' : 'text-white'}`}>{roomer.displayName}</h3>
                        <p className="text-zinc-500 text-sm truncate">{isIncoming ? 'Pending Request' : (roomer.status === 'pending_outgoing' ? 'Sent Request' : (roomer.username || roomer.email))}</p>
                    </div>
                    {isIncoming && (
                        <div className="flex gap-2">
                            <div onClick={(e) => { e.stopPropagation(); deleteRoomer(currentUser.uid, roomer.uid); }} className="w-8 h-8 flex items-center justify-center rounded-full bg-zinc-900 text-red-500 active:scale-90 border border-zinc-800">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </div>
                            <div onClick={(e) => { e.stopPropagation(); approveRoomer(currentUser.uid, roomer.uid); }} className="w-8 h-8 flex items-center justify-center rounded-full bg-white text-black active:scale-90">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                            </div>
                        </div>
                    )}
                  </button>
            )})}
          </div>
        )}
      </div>

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-2xl">
            <h2 className="text-lg font-semibold text-white mb-4">Add Roomer</h2>
            <form onSubmit={handleSearch} className="mb-4">
               <input type="text" placeholder="Email or Username" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full bg-black border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-600 focus:border-white transition-colors" autoFocus />
            </form>
            {searchError && <p className="text-red-400 text-sm mb-4 text-center">{searchError}</p>}
            {searchResult && (
              <div className="bg-black/50 rounded-xl p-3 flex items-center gap-3 mb-4 border border-zinc-800">
                <div className="w-10 h-10 rounded-full bg-zinc-800 overflow-hidden shrink-0">
                    {searchResult.photoURL ? <img src={searchResult.photoURL} className="w-full h-full object-cover" /> : <div className="w-full h-full bg-zinc-800"></div>}
                </div>
                <div className="overflow-hidden flex-1 text-left">
                    <p className="text-white font-medium truncate">{searchResult.displayName}</p>
                    <p className="text-zinc-500 text-xs truncate">{searchResult.email}</p>
                </div>
              </div>
            )}
            <div className="flex gap-3">
                <button onClick={() => {setShowAddModal(false); setSearchTerm(''); setSearchResult(null);}} className="flex-1 py-3 text-sm font-medium text-zinc-400 bg-zinc-800 rounded-xl">Cancel</button>
                <button onClick={handleAddUser} disabled={!searchResult || isProcessing} className="flex-1 py-3 text-sm font-medium text-black bg-white rounded-xl disabled:opacity-30">Add</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}