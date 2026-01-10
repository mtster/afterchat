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
  const [searchError, setSearchError] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [hasFcmToken, setHasFcmToken] = useState(false);

  // Sync Bell Icon
  useEffect(() => {
    if (!currentUser.uid) return;
    const tokenRef = ref(db, `roomers/${currentUser.uid}/fcmToken`);
    const unsub = onValue(tokenRef, (snap) => setHasFcmToken(!!snap.val()));
    return () => unsub();
  }, [currentUser.uid]);

  const handleAddFlow = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const term = searchTerm.trim();
    if (!term || isProcessing) return;

    console.log("[Add_Flow] Start processing for term:", term);
    setSearchError('');
    setIsProcessing(true);
    
    try {
      // Step 1: Search for the user
      const result = await findUserByEmailOrUsername(term);
      
      if (!result) {
        console.warn("[Add_Flow] User not found.");
        setSearchError("A roomer with these credentials doesn't exist. Try correct username, display name, or email.");
        setIsProcessing(false);
        return;
      }

      // Step 2: Validate relationship
      if (result.uid === currentUser.uid) {
        console.warn("[Add_Flow] Self-add detected.");
        setSearchError("You cannot add yourself.");
        setIsProcessing(false);
        return;
      }

      const alreadyExists = roomers.find(r => r.uid === result.uid);
      if (alreadyExists) {
        console.warn("[Add_Flow] User already in list.");
        setSearchError("User is already in your rooms.");
        setIsProcessing(false);
        return;
      }

      // Step 3: Add the user
      console.log("[Add_Flow] Match confirmed. Adding UID:", result.uid);
      await addRoomerToUser(currentUser.uid, result.uid);
      
      // Step 4: Success, close modal
      console.log("[Add_Flow] Success. Closing modal.");
      setShowAddModal(false);
      setSearchTerm('');
      setSearchError('');
    } catch (err: any) {
      console.error("[Add_Flow] Error occurred:", err.message);
      setSearchError("An unexpected error occurred. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex flex-col w-full h-full bg-background overflow-hidden">
      <div className="flex-none px-4 pb-3 flex items-center justify-between bg-zinc-900/50 backdrop-blur-md border-b border-zinc-800 sticky top-0 z-10" style={{ paddingTop: 'max(16px, env(safe-area-inset-top))' }}>
        <h1 className="text-2xl font-bold text-white tracking-tight">Rooms</h1>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setupNotifications(currentUser.uid)} 
            className={`w-8 h-8 flex items-center justify-center rounded-full bg-zinc-800 hover:bg-zinc-700 active:scale-95 transition-all ${hasFcmToken ? 'text-green-500' : 'text-zinc-500'}`}
          >
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
           <div className="flex justify-center mt-10 text-zinc-600 text-sm italic">Syncing...</div>
        ) : roomers.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[60%] text-center px-6">
            <h3 className="text-white font-medium mb-1">No Rooms Yet</h3>
            <p className="text-zinc-500 text-sm mb-6">Connect with others to start chatting.</p>
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
                      {roomer.photoURL ? <img src={roomer.photoURL} className="w-full h-full object-cover" /> : <div className="w-full h-full bg-zinc-800 flex items-center justify-center text-zinc-500 font-bold">{roomer.displayName.charAt(0)}</div>}
                    </div>
                    <div className="flex-1 text-left min-w-0">
                        <h3 className={`font-medium truncate ${isPending ? 'text-zinc-400' : 'text-white'}`}>{roomer.displayName}</h3>
                        <p className="text-zinc-500 text-sm truncate">{isIncoming ? 'Received Request' : (roomer.status === 'pending_outgoing' ? 'Awaiting Approval' : (roomer.username || roomer.email))}</p>
                    </div>
                    {isIncoming && (
                        <div className="flex gap-2">
                            <button onClick={(e) => { e.stopPropagation(); deleteRoomer(currentUser.uid, roomer.uid); }} className="w-8 h-8 flex items-center justify-center rounded-full bg-zinc-900 text-red-500 active:scale-90 border border-zinc-800">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); approveRoomer(currentUser.uid, roomer.uid); }} className="w-8 h-8 flex items-center justify-center rounded-full bg-white text-black active:scale-90">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                            </button>
                        </div>
                    )}
                  </button>
            )})}
          </div>
        )}
      </div>

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-zinc-950 border border-zinc-800 rounded-3xl p-6 shadow-2xl ring-1 ring-white/5">
            <h2 className="text-xl font-bold text-white mb-2">Find Roomer</h2>
            <p className="text-zinc-500 text-sm mb-6">Search by username, display name, or email address.</p>
            
            <form onSubmit={handleAddFlow} className="space-y-4">
               <div className="relative">
                 <input 
                   type="text" 
                   placeholder="Enter details..." 
                   value={searchTerm} 
                   onChange={(e) => {
                       setSearchTerm(e.target.value);
                       if (searchError) setSearchError('');
                   }} 
                   className="w-full bg-black border border-zinc-800 rounded-2xl px-5 py-4 text-white placeholder-zinc-700 focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 transition-all outline-none" 
                   autoFocus 
                   autoComplete="off"
                   disabled={isProcessing}
                 />
                 {isProcessing && (
                     <div className="absolute right-4 top-1/2 -translate-y-1/2">
                        <div className="w-5 h-5 border-2 border-zinc-800 border-t-white animate-spin rounded-full"></div>
                     </div>
                 )}
               </div>
               
               {searchError && (
                 <div className="px-1 animate-in fade-in slide-in-from-top-1">
                    <p className="text-red-400 text-xs leading-relaxed">{searchError}</p>
                 </div>
               )}
               
               <div className="flex gap-3 pt-2">
                  <button 
                      type="button"
                      onClick={() => { setShowAddModal(false); setSearchError(''); setSearchTerm(''); }} 
                      className="flex-1 py-4 text-sm font-bold text-zinc-500 bg-zinc-900 rounded-2xl active:scale-95 transition-all hover:text-white"
                      disabled={isProcessing}
                  >
                      Cancel
                  </button>
                  <button 
                      type="submit"
                      disabled={!searchTerm.trim() || isProcessing} 
                      className={`flex-1 py-4 text-sm font-bold rounded-2xl active:scale-95 transition-all ${(!searchTerm.trim() || isProcessing) ? 'bg-zinc-900 text-zinc-800' : 'bg-white text-black'}`}
                  >
                      {isProcessing ? 'Checking...' : 'Add'}
                  </button>
               </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}