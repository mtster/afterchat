import React, { useEffect, useState } from 'react';
import { db, findUserByEmailOrUsername, addRoomerToUser, getRoomerDetails } from '../services/firebase';
import { ref, onValue } from 'firebase/database';
import { UserProfile, Roomer } from '../types';

interface Props {
  currentUser: UserProfile;
  onNavigateChat: (roomer: Roomer) => void;
  onNavigateProfile: () => void;
}

export default function RoomsList({ currentUser, onNavigateChat, onNavigateProfile }: Props) {
  const [roomers, setRoomers] = useState<Roomer[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResult, setSearchResult] = useState<Roomer | null>(null);
  const [searchError, setSearchError] = useState('');

  // 1. Listen for my roomers
  useEffect(() => {
    const roomersRef = ref(db, `users/${currentUser.uid}/roomers`);
    const unsub = onValue(roomersRef, async (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const uids = Object.keys(data);
        const details = await Promise.all(uids.map(uid => getRoomerDetails(uid)));
        setRoomers(details.filter(r => r !== null) as Roomer[]);
      } else {
        setRoomers([]);
      }
      setLoading(false);
    });
    return () => unsub();
  }, [currentUser.uid]);

  // 2. Search Logic
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setSearchError('');
    setSearchResult(null);
    let term = searchTerm.trim();
    if (!term) return;

    // Auto-Prefix $ logic if it looks like a username (not email)
    if (!term.includes('@') && !term.startsWith('$')) {
        term = '$' + term;
    }

    try {
      const result = await findUserByEmailOrUsername(term);
      if (result) {
        if (result.uid === currentUser.uid) {
            setSearchError("You cannot add yourself.");
        } else {
            setSearchResult(result);
        }
      } else {
        setSearchError('User not found.');
      }
    } catch (err) {
      setSearchError('Search failed.');
    }
  };

  // 3. Add Logic
  const handleAddUser = async () => {
    if (!searchResult) return;
    try {
      await addRoomerToUser(currentUser.uid, searchResult.uid);
      setShowAddModal(false);
      setSearchTerm('');
      setSearchResult(null);
    } catch (err) {
      console.error(err);
      alert("Could not add user.");
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-background">
      {/* Header */}
      <div className="pt-safe-top px-4 pb-3 flex items-center justify-between bg-zinc-900/50 backdrop-blur-md border-b border-zinc-800">
        <h1 className="text-2xl font-bold text-white tracking-tight">Rooms</h1>
        
        <div className="flex items-center gap-3">
          {/* Search Icon (Triggers Modal with Search focus) */}
          <button 
            onClick={() => setShowAddModal(true)}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-zinc-800 text-zinc-400"
          >
             <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          </button>

          {/* Add Roomer Button */}
          <button 
            onClick={() => setShowAddModal(true)}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-zinc-800 hover:bg-zinc-700 active:scale-95 transition-all text-zinc-300"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>

          {/* Profile Circle */}
          <button 
            onClick={onNavigateProfile}
            className="w-8 h-8 rounded-full overflow-hidden border border-zinc-700 active:scale-95 transition-transform"
          >
             {currentUser.photoURL ? (
               <img src={currentUser.photoURL} alt="Me" className="w-full h-full object-cover" />
             ) : (
               <div className="w-full h-full bg-zinc-800 flex items-center justify-center">
                 <svg className="w-4 h-4 text-zinc-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" /></svg>
               </div>
             )}
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto no-scrollbar p-4">
        {loading ? (
           <div className="flex justify-center mt-10 text-zinc-600 text-sm">Loading...</div>
        ) : roomers.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[60vh] text-center px-6">
            <div className="w-16 h-16 bg-zinc-900 rounded-full flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
            </div>
            <h3 className="text-white font-medium mb-1">No Rooms Yet</h3>
            <p className="text-zinc-500 text-sm mb-6">Add people to start chatting.</p>
            <button 
              onClick={() => setShowAddModal(true)}
              className="px-6 py-2 bg-white text-black text-sm font-semibold rounded-full active:scale-95 transition-transform"
            >
              Add Roomer
            </button>
          </div>
        ) : (
          <div className="space-y-1">
            {roomers.map(roomer => (
              <button
                key={roomer.uid}
                onClick={() => onNavigateChat(roomer)}
                className="w-full flex items-center gap-4 p-3 hover:bg-zinc-900/50 rounded-xl transition-colors active:bg-zinc-900"
              >
                {/* Avatar */}
                <div className="w-12 h-12 rounded-full bg-zinc-800 overflow-hidden flex-shrink-0 border border-zinc-800">
                  {roomer.photoURL ? (
                    <img src={roomer.photoURL} alt={roomer.displayName} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-zinc-500">
                      <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" /></svg>
                    </div>
                  )}
                </div>
                {/* Info */}
                <div className="flex-1 text-left min-w-0">
                  <div className="flex justify-between items-baseline">
                    <h3 className="text-white font-medium truncate">{roomer.displayName}</h3>
                  </div>
                  <p className="text-zinc-500 text-sm truncate">{roomer.username || roomer.email}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Add Roomer Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-2xl">
            <h2 className="text-lg font-semibold text-white mb-4">Add Roomer</h2>
            
            <form onSubmit={handleSearch} className="mb-4">
              <div className="relative flex gap-2">
                <input
                  type="text"
                  placeholder="Email or Username"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="flex-1 bg-black border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-600 focus:border-white focus:outline-none transition-colors"
                  autoFocus
                />
                 {/* New Search Button */}
                 <button 
                    type="submit"
                    className="bg-white text-black font-bold text-sm px-4 rounded-xl active:scale-95 transition-transform"
                 >
                    Search
                 </button>
              </div>
            </form>

            {/* Results Area */}
            {searchError && <p className="text-red-400 text-sm mb-4 text-center">{searchError}</p>}
            
            {searchResult && (
              <div className="bg-black/50 rounded-xl p-3 flex items-center gap-3 mb-4 border border-zinc-800">
                <div className="w-10 h-10 rounded-full bg-zinc-800 overflow-hidden">
                    {searchResult.photoURL ? (
                        <img src={searchResult.photoURL} alt="" className="w-full h-full object-cover" />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-zinc-500">
                             <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" /></svg>
                        </div>
                    )}
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">{searchResult.displayName}</p>
                    <p className="text-zinc-500 text-xs truncate">{searchResult.username || searchResult.email}</p>
                </div>
                <button 
                    onClick={handleAddUser}
                    className="bg-white text-black text-xs font-bold px-3 py-1.5 rounded-full"
                >
                    ADD
                </button>
              </div>
            )}

            <button 
              onClick={() => { setShowAddModal(false); setSearchTerm(''); setSearchResult(null); setSearchError(''); }}
              className="w-full py-3 text-zinc-400 text-sm hover:text-white transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}