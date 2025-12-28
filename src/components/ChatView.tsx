import React, { useEffect, useState, useRef } from 'react';
import { ref, push, onValue, serverTimestamp, get, child, update, onDisconnect } from 'firebase/database';
import { db } from '../services/firebase';
import { Message, UserProfile, Roomer } from '../types';

interface ChatViewProps {
  roomId: string;
  recipient: Roomer;
  currentUser: UserProfile;
  onBack: () => void;
}

const ChatView: React.FC<ChatViewProps> = ({ roomId, recipient, currentUser, onBack }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isVisible, setIsVisible] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  
  // Status Logic
  const isPendingOutgoing = recipient.status === 'pending_outgoing';
  const isPendingIncoming = recipient.status === 'pending_incoming';
  const isAccepted = recipient.status === 'accepted';
  const isBlocked = !isAccepted && !isPendingOutgoing && !isPendingIncoming;

  // Animation Mount
  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 10);
    return () => clearTimeout(timer);
  }, []);

  // Presence Logic: Track Active Room
  useEffect(() => {
    if (!currentUser.uid) return;

    const userRef = ref(db, `users/${currentUser.uid}`);
    const connectedRef = ref(db, '.info/connected');
    
    // Listen for connection state changes
    const unsubscribe = onValue(connectedRef, (snap) => {
        if (snap.val() === true) {
            // We are connected.
            // 1. Establish Presence
            update(userRef, { activeRoom: roomId });
            // 2. Queue disconnect clean up
            onDisconnect(userRef).update({ activeRoom: null });
        }
    });

    return () => {
      unsubscribe();
      // Clear on clean unmount
      update(userRef, { activeRoom: null });
    };
  }, [roomId, currentUser.uid]);

  const handleBack = () => {
    setIsVisible(false);
    setTimeout(onBack, 300);
  };

  useEffect(() => {
    const messagesRef = ref(db, `rooms/${roomId}/messages`);
    const unsubscribe = onValue(messagesRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const loadedMessages = Object.entries(data).map(([key, val]: [string, any]) => ({
          id: key,
          ...val
        })).sort((a, b) => a.timestamp - b.timestamp);
        setMessages(loadedMessages);
      } else {
        setMessages([]);
      }
    });

    return () => unsubscribe();
  }, [roomId]);

  useEffect(() => {
    if (bottomRef.current) {
        bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = inputText.trim();
    if (!text || !isAccepted) return;

    setInputText('');
    
    if (inputRef.current) {
        inputRef.current.focus();
    }

    // 1. Send Message to DB
    const messagesRef = ref(db, `rooms/${roomId}/messages`);
    await push(messagesRef, {
      senderId: currentUser.uid,
      senderName: currentUser.displayName || 'User',
      text: text,
      timestamp: serverTimestamp()
    });

    // 2. Trigger Notification Proxy
    try {
        console.log(`[Notif_Debug] ------------------------------------------------`);
        console.log(`[Notif_Debug] Starting notification trigger for message: "${text}"`);
        
        // Fetch recipient details to get the token AND their activeRoom
        const snapshot = await get(child(ref(db), `users/${recipient.uid}`));
        if (snapshot.exists()) {
            const val = snapshot.val();
            const targetToken = val.fcmToken;
            const recipientActiveRoom = val.activeRoom;

            console.log(`[Notif_Debug] Recipient found.`);
            console.log(`[Notif_Debug] Token exists: ${!!targetToken ? 'YES' : 'NO'}`);
            console.log(`[Notif_Debug] Token Value (first 10 chars): ${targetToken ? targetToken.substring(0, 10) + '...' : 'N/A'}`);
            console.log(`[Notif_Debug] Recipient Active Room: ${recipientActiveRoom || 'None'}`);
            console.log(`[Notif_Debug] Current Room ID: ${roomId}`);

            // CONDITION: Only send if recipient is NOT currently in this room
            if (targetToken && recipientActiveRoom !== roomId) {
                 
                 console.log("[Notif_Debug] Condition met (Recipient is away or offline). Preparing payload...");

                 // Fetch sender details (Me) for the notification text
                 const mySnapshot = await get(child(ref(db), `users/${currentUser.uid}`));
                 const myData = mySnapshot.exists() ? mySnapshot.val() : {};

                 // Clean username: Remove '$' prefix if present
                 const rawUsername = myData.username || '';
                 const cleanUsername = rawUsername.startsWith('$') ? rawUsername.substring(1) : rawUsername;

                 const payload = {
                     targetToken: targetToken,
                     senderUsername: cleanUsername,
                     senderDisplayName: myData.displayName || currentUser.displayName || 'Rooms User',
                     senderEmail: myData.email || currentUser.email || '',
                     messageText: text
                 };

                 console.log("[Notif_Debug] Sending JSON Payload:", JSON.stringify(payload));
                 console.log("[Notif_Debug] URL: https://script.google.com/macros/s/AKfycbz0NjB2LCQ08BiEdvyvxZCQw0dntXhVs68u51xZWdSZ3VnllLXBRn83AXlDAYPd-d-GfQ/exec");

                 const res = await fetch("https://script.google.com/macros/s/AKfycbz0NjB2LCQ08BiEdvyvxZCQw0dntXhVs68u51xZWdSZ3VnllLXBRn83AXlDAYPd-d-GfQ/exec", {
                     method: "POST",
                     mode: "no-cors",
                     headers: { "Content-Type": "text/plain;charset=utf-8" }, // Changed to text/plain to avoid preflight issues in some envs
                     body: JSON.stringify(payload)
                 });
                 
                 console.log(`[Notif_Debug] Fetch executed. Status (opaque due to no-cors): ${res.status}`);
            } else {
                 if (!targetToken) console.log("[Notif_Debug] Skipped: No target token.");
                 if (recipientActiveRoom === roomId) console.log("[Notif_Debug] Skipped: User is currently active in this room.");
            }
        } else {
             console.log("[Notif_Debug] Recipient user data does not exist in DB.");
        }
    } catch (e) {
        console.error("[Notif_Debug] FATAL ERROR in handleSend:", e);
    }
  };

  return (
    <div 
        className={`flex flex-col h-[100dvh] w-screen bg-background fixed inset-0 z-20 transition-transform duration-300 ease-in-out ${isVisible ? 'translate-x-0' : 'translate-x-full'}`}
    >
      {/* Header - Sticky with explicitly calculated Safe Area Padding */}
      <div 
        className="flex-none grid grid-cols-6 items-center px-4 py-3 border-b border-border bg-background/90 backdrop-blur-md sticky top-0 z-50"
        style={{ paddingTop: 'max(16px, env(safe-area-inset-top))' }}
      >
        <button 
          onClick={handleBack}
          className="col-span-1 justify-self-start text-white p-2 -ml-2 active:opacity-50"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        
        <div className="col-span-4 flex flex-col items-center justify-center">
            <span className="font-semibold text-[17px] text-white truncate max-w-[200px]">{recipient.displayName}</span>
        </div>

        <div className="col-span-1" />
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar bg-background w-full">
        {messages.map((msg) => {
          const isMe = msg.senderId === currentUser.uid;
          return (
            <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
              <div 
                className={`max-w-[75%] px-4 py-2 rounded-2xl text-[15px] leading-snug break-words ${
                  isMe 
                    ? 'bg-blue-600 text-white rounded-tr-sm' 
                    : 'bg-zinc-800 text-zinc-100 rounded-tl-sm'
                }`}
              >
                {msg.text}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} className="h-4" />
      </div>

      {/* Input Area - Footer with Safe Area */}
      <div 
        className="flex-none p-3 bg-zinc-900 border-t border-border z-30 w-full"
        style={{ paddingBottom: 'max(10px, env(safe-area-inset-bottom))' }}
      >
        {!isAccepted ? (
            <div className="w-full py-3 text-center text-zinc-400 text-sm font-medium bg-zinc-950/50 rounded-lg border border-zinc-800">
                {isPendingOutgoing && `Waiting for ${recipient.displayName} to accept.`}
                {isPendingIncoming && `Accept this roomer to start chatting.`}
                {isBlocked && `This roomer has removed you.`}
            </div>
        ) : (
            <form onSubmit={handleSend} className="flex gap-2 items-center">
            <input
                ref={inputRef}
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Message"
                className="flex-1 bg-black border border-zinc-700 rounded-full px-4 py-2 text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500 transition-colors"
                autoComplete="off"
                enterKeyHint="send"
            />
            <button 
                type="submit"
                disabled={!inputText.trim()}
                onMouseDown={(e) => e.preventDefault()}
                onTouchStart={(e) => e.preventDefault()}
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-all flex-shrink-0 ${
                inputText.trim() ? 'bg-blue-600 text-white active:scale-95' : 'bg-zinc-800 text-zinc-500'
                }`}
            >
                <svg className="w-5 h-5 ml-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
                </svg>
            </button>
            </form>
        )}
      </div>
    </div>
  );
};

export default ChatView;