import React, { useEffect, useState } from 'react';
import { db, findUserByEmailOrUsername, addRoomerToUser, getRoomerDetails, approveRoomer, deleteRoomer } from '../services/firebase';
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
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    const userRef = ref(db, `users/${currentUser.uid}`);
    const unsub = onValue(userRef, async (snapshot) => {
      const data = snapshot.val();
      const allRoomers: Roomer[] = [];
      if (data) {
        if (data.addedUsers) {
             const addedUids = Object.keys(data.addedUsers);
             const addedDetails = await Promise.all(addedUids.map(async (uid) => {
                 const val = data.addedUsers[uid];
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
      setLoading(false);
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
            }
        }
      } else {
        setSearchError('User not found.');
      }
    } catch (err: any) {
      setSearchError(err.code === 'PERMISSION_DENIED' ? "Access Denied: Check DB Rules" : "Search failed.");
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
      alert(`Could not add user.\nCode: ${err.code || 'UNKNOWN'}`);
    }
    setIsProcessing(false);
  };

  const handleApprove = async (e: React.MouseEvent, uid: string) => {
      e.stopPropagation();
      await approveRoomer(currentUser.uid, uid);
  };

  const handleReject = async (e: React.MouseEvent, uid: string) => {
      e.stopPropagation();
      if(window.confirm("Reject this request?")) {
        await deleteRoomer(currentUser.uid, uid);
      }
  };

  return (
    <div className="flex flex-col w-full h-[100dvh] bg-background overflow-hidden">
      {/* Header - Sticky with Safe Area */}
      <div 
        className="flex-none px-4 pb-3 flex items-center justify-between bg-zinc-900/50 backdrop-blur-md border-b border-zinc-800 sticky top-0 z-10"
        style={{ paddingTop: 'max(16px, env(safe-area-inset-top))' }}
      >
        <h1 className="text-2xl font-bold text-white tracking-tight">Rooms</h1>
        
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setShowAddModal(true)}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-zinc-800 hover:bg-zinc-700 active:scale-95 transition-all text-zinc-300"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>

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
      <div className="flex-1 overflow-y-auto no-scrollbar p-4 pb-20">
        {loading ? (
           <div className="flex justify-center mt-10 text-zinc-600 text-sm">Loading...</div>
        ) : roomers.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[60%] text-center px-6">
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
            {roomers.map(roomer => {
                const isPending = roomer.status === 'pending_incoming' || roomer.status === 'pending_outgoing';
                const isIncoming = roomer.status === 'pending_incoming';
                return (
                  <button
                    key={roomer.uid}
                    onClick={() => onNavigateChat(roomer)}
                    className={`w-full flex items-center gap-4 p-3 rounded-xl transition-colors active:bg-zinc-900 ${isPending ? 'bg-zinc-900/20 opacity-70' : 'hover:bg-zinc-900/50'}`}
                  >
                    <div className={`w-12 h-12 rounded-full overflow-hidden flex-shrink-0 border ${isPending ? 'border-zinc-800 opacity-50' : 'border-zinc-700'}`}>
                      {roomer.photoURL ? (
                        <img src={roomer.photoURL} alt={roomer.displayName} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-zinc-500 bg-zinc-800">
                          <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" /></svg>
                        </div>
                      )}
                    </div>
                    <div className="flex-1 text-left min-w-0">
                      <div className="flex justify-between items-baseline">
                        <h3 className={`font-medium truncate ${isPending ? 'text-zinc-400' : 'text-white'}`}>{roomer.displayName}</h3>
                      </div>
                      <p className="text-zinc-500 text-sm truncate">
                        {isIncoming ? 'Pending Request' : (roomer.status === 'pending_outgoing' ? 'Sent Request' : (roomer.username || roomer.email))}
                      </p>
                    </div>
                    {isIncoming && (
                        <div className="flex gap-2">
                            <div 
                                onClick={(e) => handleReject(e, roomer.uid)}
                                className="w-8 h-8 flex items-center justify-center rounded-full bg-zinc-900 border border-zinc-800 text-red-500 active:scale-90"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </div>
                            <div 
                                onClick={(e) => handleApprove(e, roomer.uid)}
                                className="w-8 h-8 flex items-center justify-center rounded-full bg-white text-black active:scale-90"
                            >
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
               <input
                  type="text"
                  placeholder="Email or Username"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-black border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-600 focus:border-white focus:outline-none transition-colors"
                  autoFocus
                />
            </form>
            {searchError && <p className="text-red-400 text-sm mb-4 text-center">{searchError}</p>}
            {searchResult && (
              <div className="bg-black/50 rounded-xl p-3 flex items-center gap-3 mb-4 border border-zinc-800">
                <div className="w-10 h-10 rounded-full bg-zinc-800 overflow-hidden">
                    {searchResult.photoURL ? (
                        <img src={searchResult.photoURL} alt="" className="w-full h-full object-cover" />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-zinc-500 bg-zinc-800">?</div>
                    )}
                </div>
                <div className="overflow-hidden flex-1">
                    <p className="text-white font-medium truncate">{searchResult.displayName}</p>
                    <p className="text-zinc-500 text-xs truncate">{searchResult.email}</p>
                </div>
              </div>
            )}
            <div className="flex gap-3">
                <button onClick={() => {setShowAddModal(false); setSearchTerm(''); setSearchResult(null);}} className="flex-1 py-3 text-sm font-medium text-zinc-400 bg-zinc-800 rounded-xl">Cancel</button>
                <button onClick={handleAddUser} disabled={!searchResult || isProcessing} className="flex-1 py-3 text-sm font-medium text-black bg-white rounded-xl disabled:opacity-50">Add</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}