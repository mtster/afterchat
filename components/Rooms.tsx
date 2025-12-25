import React, { useEffect, useState } from 'react';
import { ref, onValue } from 'firebase/database';
import { db } from '../services/firebase';
import { Room } from '../types';

interface RoomsProps {
  onSelectRoom: (roomId: string) => void;
}

const Rooms: React.FC<RoomsProps> = ({ onSelectRoom }) => {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);

  // Use a hardcoded list of rooms for this demo since we don't have a "Create Room" UI flow in the prompt requirements
  // In a real app, you would fetch `userRooms` from DB.
  useEffect(() => {
    // Simulating fetching rooms. In reality, you'd query Firebase.
    // For demo purposes, we will mock a subscription or fetch global rooms
    const roomsRef = ref(db, 'rooms');
    const unsubscribe = onValue(roomsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const roomList = Object.entries(data).map(([key, value]: [string, any]) => ({
          id: key,
          ...value
        }));
        setRooms(roomList);
      } else {
        // Fallback for demo if DB is empty
        setRooms([
          { id: 'general', name: 'General', participants: {}, lastMessage: 'Welcome to Onyx', lastMessageTimestamp: Date.now() },
          { id: 'random', name: 'Design Team', participants: {}, lastMessage: 'The new assets are ready.', lastMessageTimestamp: Date.now() - 100000 }
        ]);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted">
        <span className="animate-pulse">Loading Rooms...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full bg-background">
      <header className="px-6 py-6 border-b border-border bg-background/80 backdrop-blur-md sticky top-0 z-10">
        <h1 className="text-3xl font-bold tracking-tight text-white">Rooms</h1>
      </header>
      
      <div className="flex-1 overflow-y-auto no-scrollbar">
        {rooms.map((room) => (
          <div 
            key={room.id}
            onClick={() => onSelectRoom(room.id)}
            className="flex items-center gap-4 px-6 py-5 border-b border-border active:bg-zinc-900 transition-colors cursor-pointer"
          >
            <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center overflow-hidden shrink-0">
               {room.avatar ? (
                 <img src={room.avatar} alt={room.name} className="w-full h-full object-cover" />
               ) : (
                 <span className="text-lg font-medium text-zinc-400">{room.name.charAt(0)}</span>
               )}
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-baseline mb-1">
                <h3 className="text-base font-semibold text-white truncate">{room.name}</h3>
                {room.lastMessageTimestamp && (
                  <span className="text-xs text-zinc-500">
                    {new Date(room.lastMessageTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </div>
              <p className="text-sm text-zinc-400 truncate leading-relaxed">
                {room.lastMessage || "No messages yet"}
              </p>
            </div>
          </div>
        ))}
        
        {/* Safe area spacer */}
        <div className="h-20"></div>
      </div>
    </div>
  );
};

export default Rooms;