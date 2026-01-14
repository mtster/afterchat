import React, { useEffect, useState, useRef } from 'react';
import { ref, push, onValue, serverTimestamp, get, child, update, onDisconnect, query, orderByChild, limitToLast, startAt, off } from 'firebase/database';
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
  const isFirstLoad = useRef(true);
  
  const isAccepted = recipient.status === 'accepted';
  const isPendingOutgoing = recipient.status === 'pending_outgoing';
  const isPendingIncoming = recipient.status === 'pending_incoming';
  const isBlocked = !isAccepted && !isPendingOutgoing && !isPendingIncoming;

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 10);
    return () => clearTimeout(timer);
  }, []);

  // INSTANT PRESENCE SCHEME
  useEffect(() => {
    if (!currentUser.uid) return;

    const userRef = ref(db, `roomers/${currentUser.uid}`);
    
    const setStatus = (status: string | null) => {
        update(userRef, { activeRoom: status }).catch(() => {});
    };

    setStatus(roomId);
    const disconnectRef = onDisconnect(userRef);
    disconnectRef.update({ activeRoom: null });

    const handleVisibility = () => {
        if (document.visibilityState === 'hidden') setStatus(null);
        else setStatus(roomId);
    };

    const handleUnload = () => setStatus(null);

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('beforeunload', handleUnload);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('beforeunload', handleUnload);
      disconnectRef.cancel();
      setStatus(null);
    };
  }, [roomId, currentUser.uid]);

  const handleBack = async () => {
    setIsVisible(false);
    await update(ref(db, `roomers/${currentUser.uid}`), { activeRoom: null });
    setTimeout(onBack, 300);
  };

  // EFFICIENT DATA FETCHING: CACHE + DELTA UPDATES
  useEffect(() => {
    const CACHE_KEY = `chat_cache_${roomId}`;
    const messagesRef = ref(db, `messages/${roomId}`); // FLATTENED STRUCTURE
    let unsubscribe: () => void;

    const loadData = async () => {
        // 1. Load from Cache first
        let initialMessages: Message[] = [];
        try {
            const cachedStr = localStorage.getItem(CACHE_KEY);
            if (cachedStr) {
                initialMessages = JSON.parse(cachedStr);
                setMessages(initialMessages);
                console.log(`[DB_OPTIMIZATION] Loaded ${initialMessages.length} messages from Cache for room ${roomId}`);
            }
        } catch (e) {
            console.error("[Cache_Error]", e);
        }

        // 2. Determine Query Strategy
        let msgQuery;
        
        if (initialMessages.length > 0) {
            // Delta Fetch: Only get messages NEWER than the last one we have
            const lastMsg = initialMessages[initialMessages.length - 1];
            // +1 to timestamp to avoid fetching the last message again
            const startTimestamp = (lastMsg.timestamp || 0) + 1; 
            console.log(`[DB_OPTIMIZATION] Delta Sync: Fetching messages after timestamp ${startTimestamp}`);
            msgQuery = query(messagesRef, orderByChild('timestamp'), startAt(startTimestamp));
        } else {
            // First time load: Limit to last 25 to save bandwidth
            console.log(`[DB_OPTIMIZATION] Fresh Load: Fetching last 25 messages from Network`);
            msgQuery = query(messagesRef, orderByChild('timestamp'), limitToLast(25));
        }

        // 3. Set up Listener
        unsubscribe = onValue(msgQuery, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                const newMessages = Object.entries(data).map(([key, val]: [string, any]) => ({
                    id: key,
                    ...val
                })).sort((a, b) => a.timestamp - b.timestamp);

                setMessages(prev => {
                    // Merge logic: Filter out duplicates based on ID
                    const existingIds = new Set(prev.map(m => m.id));
                    const uniqueNew = newMessages.filter(m => !existingIds.has(m.id));
                    
                    if (uniqueNew.length === 0) return prev;

                    console.log(`[DB_OPTIMIZATION] Network delivered ${uniqueNew.length} new messages.`);
                    const merged = [...prev, ...uniqueNew].sort((a, b) => a.timestamp - b.timestamp);
                    
                    // Update Cache
                    try {
                        // Limit cache size to avoid localStorage limits (e.g. keep last 500)
                        const toCache = merged.slice(-500); 
                        localStorage.setItem(CACHE_KEY, JSON.stringify(toCache));
                    } catch (e) { console.warn("Cache full"); }
                    
                    return merged;
                });
            }
        });
    };

    loadData();

    return () => {
        if (unsubscribe) unsubscribe();
        off(messagesRef);
    };
  }, [roomId]);

  // Scroll logic
  useEffect(() => {
    if (bottomRef.current) {
        // Instant scroll on first load, smooth on new messages
        const behavior = isFirstLoad.current ? 'instant' : 'smooth';
        bottomRef.current.scrollIntoView({ behavior: behavior as ScrollBehavior });
        isFirstLoad.current = false;
    }
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = inputText.trim();
    if (!text || !isAccepted) return;

    setInputText('');
    if (inputRef.current) inputRef.current.focus();

    // FLATTENED WRITE: messages/$roomId instead of rooms/$roomId/messages
    const messagesRef = ref(db, `messages/${roomId}`);
    await push(messagesRef, {
      senderId: currentUser.uid,
      senderName: currentUser.displayName || 'User',
      text: text,
      timestamp: serverTimestamp()
    });

    // Send Notification Trigger
    try {
        const snapshot = await get(child(ref(db), `roomers/${recipient.uid}`));
        if (snapshot.exists()) {
            const val = snapshot.val();
            const targetToken = val.fcmToken;
            const recipientActiveRoom = val.activeRoom;

            if (targetToken && recipientActiveRoom !== roomId) {
                 const mySnapshot = await get(child(ref(db), `roomers/${currentUser.uid}`));
                 const myData = mySnapshot.exists() ? mySnapshot.val() : {};
                 const rawUsername = myData.username || '';
                 const cleanUsername = rawUsername.startsWith('$') ? rawUsername.substring(1) : rawUsername;

                 const payload = {
                     targetToken: targetToken,
                     senderUsername: cleanUsername,
                     senderDisplayName: myData.displayName || currentUser.displayName || 'Rooms User',
                     senderEmail: myData.email || currentUser.email || '',
                     messageText: text,
                     roomId: roomId
                 };

                 // Fire and forget - don't await the fetch to keep UI snappy
                 fetch("https://script.google.com/macros/s/AKfycbyYT6o7oa_HYk_p1qCAaXJKqxdKdcTNw0G6b3SxEmHgxqjUVf7cFmQjmG6oLyZEP6VVLg/exec", {
                     method: "POST",
                     mode: "no-cors",
                     headers: { "Content-Type": "text/plain;charset=utf-8" },
                     body: JSON.stringify(payload)
                 }).catch(e => console.warn("Notif failed", e));
            }
        }
    } catch (e) {}
  };

  const formatMessageWithLinks = (text: string) => {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = text.split(urlRegex);
    
    return parts.map((part, index) => {
      if (part.match(urlRegex)) {
        return (
          <a
            key={index}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 break-all cursor-pointer opacity-90 hover:opacity-100"
            onClick={(e) => e.stopPropagation()}
          >
            {part}
          </a>
        );
      }
      return part;
    });
  };

  return (
    <div className={`flex flex-col h-[100dvh] w-screen bg-background fixed inset-0 z-20 transition-transform duration-300 ease-in-out ${isVisible ? 'translate-x-0' : 'translate-x-full'}`}>
      <div className="flex-none grid grid-cols-6 items-center px-4 py-3 border-b border-border bg-background/90 backdrop-blur-md sticky top-0 z-50" style={{ paddingTop: 'max(16px, env(safe-area-inset-top))' }}>
        <button onClick={handleBack} className="col-span-1 justify-self-start text-white p-2 -ml-2 active:opacity-50">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </button>
        <div className="col-span-4 flex flex-col items-center justify-center">
            <span className="font-semibold text-[17px] text-white truncate max-w-[200px]">{recipient.displayName}</span>
        </div>
        <div className="col-span-1" />
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar bg-background w-full">
        {messages.map((msg) => {
          const isMe = msg.senderId === currentUser.uid;
          return (
            <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[75%] px-4 py-2 rounded-2xl text-[15px] leading-snug break-words ${isMe ? 'bg-blue-600 text-white rounded-tr-sm' : 'bg-zinc-800 text-zinc-100 rounded-tl-sm'}`}>
                {formatMessageWithLinks(msg.text)}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} className="h-4" />
      </div>

      <div className="flex-none p-3 bg-zinc-900 border-t border-border z-30 w-full" style={{ paddingBottom: 'max(10px, env(safe-area-inset-bottom))' }}>
        {!isAccepted ? (
            <div className="w-full py-3 text-center text-zinc-400 text-sm font-medium bg-zinc-950/50 rounded-lg border border-zinc-800">
                {isPendingOutgoing && `Waiting for ${recipient.displayName} to accept.`}
                {isPendingIncoming && `Accept this roomer to start chatting.`}
                {isBlocked && `This roomer has removed you.`}
            </div>
        ) : (
            <form onSubmit={handleSend} className="flex gap-2 items-center">
            <input ref={inputRef} type="text" value={inputText} onChange={(e) => setInputText(e.target.value)} placeholder="Message" className="flex-1 bg-black border border-zinc-700 rounded-full px-4 py-2 text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500 transition-colors" autoComplete="off" enterKeyHint="send" />
            <button type="submit" disabled={!inputText.trim()} className={`w-10 h-10 rounded-full flex items-center justify-center transition-all flex-shrink-0 ${inputText.trim() ? 'bg-blue-600 text-white active:scale-95' : 'bg-zinc-800 text-zinc-500'}`}>
                <svg className="w-5 h-5 ml-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" /></svg>
            </button>
            </form>
        )}
      </div>
    </div>
  );
};

export default ChatView;