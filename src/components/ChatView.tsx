import React, { useEffect, useState, useRef } from 'react';
import { ref, push, onValue, serverTimestamp, get, child, update, onDisconnect, query, orderByChild, limitToLast, startAt, off, endBefore } from 'firebase/database';
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
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [allLoaded, setAllLoaded] = useState(false);
  
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isInitialLoad = useRef(true);
  const previousScrollHeight = useRef(0);
  const loadingTriggerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
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
    const setStatus = (status: string | null) => { update(userRef, { activeRoom: status }).catch(() => {}); };

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

  // INITIAL LOAD & REALTIME NEW MESSAGES
  useEffect(() => {
    const messagesRef = ref(db, `messages/${roomId}`);
    let unsubscribe: () => void;

    // Reset initial load flag when entering a new room
    isInitialLoad.current = true;

    const loadData = async () => {
        console.log(`[DB_OPTIMIZATION] Fresh Load: Fetching last 25 messages from Network`);
        const q = query(messagesRef, orderByChild('timestamp'), limitToLast(25));

        unsubscribe = onValue(q, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                const newMessages = Object.entries(data).map(([key, val]: [string, any]) => ({
                    id: key,
                    ...val
                })).sort((a, b) => a.timestamp - b.timestamp);

                setMessages(prev => {
                    const existingIds = new Set(prev.map(m => m.id));
                    const uniqueNew = newMessages.filter(m => !existingIds.has(m.id));
                    
                    if (uniqueNew.length === 0) return prev;
                    
                    console.log(`[DB_OPTIMIZATION] Realtime update: ${uniqueNew.length} new messages.`);
                    return [...prev, ...uniqueNew].sort((a, b) => a.timestamp - b.timestamp);
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

  // PAGINATION: LOAD OLDER MESSAGES
  const loadOlderMessages = async () => {
      if (isLoadingOlder || allLoaded || messages.length === 0) return;
      
      setIsLoadingOlder(true);
      const oldestMsg = messages[0];
      console.log(`[Pagination] Loading older messages before: ${oldestMsg.timestamp}`);

      try {
          const messagesRef = ref(db, `messages/${roomId}`);
          const q = query(
              messagesRef, 
              orderByChild('timestamp'), 
              endBefore(oldestMsg.timestamp), 
              limitToLast(10)
          );

          const snapshot = await get(q);
          if (snapshot.exists()) {
              const data = snapshot.val();
              const olderMessages = Object.entries(data).map(([key, val]: [string, any]) => ({
                  id: key,
                  ...val
              })).sort((a, b) => a.timestamp - b.timestamp);

              console.log(`[Pagination] Loaded ${olderMessages.length} older messages.`);

              if (olderMessages.length < 10) {
                  setAllLoaded(true);
              }

              // Capture scroll height before DOM update to maintain position
              if (containerRef.current) {
                  previousScrollHeight.current = containerRef.current.scrollHeight;
              }

              setMessages(prev => [...olderMessages, ...prev]);
          } else {
              console.log(`[Pagination] No more older messages.`);
              setAllLoaded(true);
          }
      } catch (e) {
          console.error("[Pagination] Error:", e);
      } finally {
          setIsLoadingOlder(false);
      }
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
      // 1. Disable listener during initial load
      if (isInitialLoad.current) return;

      // 2. Throttled "Ceiling" Check
      // Only trigger if user stays near top for 500ms (avoids accidental triggers on fast scroll)
      const scrollTop = e.currentTarget.scrollTop;
      
      if (scrollTop < 30 && !isLoadingOlder && !allLoaded) {
          if (!loadingTriggerRef.current) {
              loadingTriggerRef.current = setTimeout(() => {
                  // Double check after timeout if we are still at the top
                  if (containerRef.current && containerRef.current.scrollTop < 30) {
                      loadOlderMessages();
                  }
                  loadingTriggerRef.current = null;
              }, 500); 
          }
      } else {
          // If user scrolls away from top, cancel the trigger
          if (loadingTriggerRef.current) {
              clearTimeout(loadingTriggerRef.current);
              loadingTriggerRef.current = null;
          }
      }
  };

  // SCROLL POSITION MANAGEMENT
  useEffect(() => {
    // 1. Initial Load: Instant Jump to Bottom
    if (isInitialLoad.current && messages.length > 0) {
        if (containerRef.current) {
            containerRef.current.scrollTop = containerRef.current.scrollHeight;
        }
        // Small delay to ensure DOM paint before enabling scroll listener
        setTimeout(() => {
            isInitialLoad.current = false;
        }, 100);
    } 
    // 2. Pagination Load: Maintain Relative Position
    else if (previousScrollHeight.current > 0 && containerRef.current) {
        const newScrollHeight = containerRef.current.scrollHeight;
        const diff = newScrollHeight - previousScrollHeight.current;
        containerRef.current.scrollTop = diff;
        previousScrollHeight.current = 0; // Reset
    }
    // 3. New Message: Smooth Scroll
    else if (!isLoadingOlder && bottomRef.current) {
        bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoadingOlder]);


  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = inputText.trim();
    if (!text || !isAccepted) return;

    setInputText('');
    if (inputRef.current) inputRef.current.focus();

    const messagesRef = ref(db, `messages/${roomId}`);
    await push(messagesRef, {
      senderId: currentUser.uid,
      senderName: currentUser.displayName || 'User',
      text: text,
      timestamp: serverTimestamp()
    });

    // VERCEL NOTIFICATION API
    try {
        const snapshot = await get(child(ref(db), `roomers/${recipient.uid}`));
        if (snapshot.exists()) {
            const val = snapshot.val();
            const targetToken = val.fcmToken;
            const recipientActiveRoom = val.activeRoom;

            // Only send if recipient is NOT looking at this room
            if (targetToken && recipientActiveRoom !== roomId) {
                 const mySnapshot = await get(child(ref(db), `roomers/${currentUser.uid}`));
                 const myData = mySnapshot.exists() ? mySnapshot.val() : {};
                 const rawUsername = myData.username || '';
                 const displayName = myData.displayName || currentUser.displayName || 'Rooms User';

                 console.log(`[Vercel] Triggering Notification to ${targetToken.substring(0, 10)}...`);

                 fetch('/api/notify', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        token: targetToken,
                        title: `New Message from ${displayName}`,
                        body: text,
                        data: {
                            roomId: roomId,
                            senderId: currentUser.uid
                        }
                    })
                 })
                 .then(async res => {
                     const data = await res.json();
                     if (res.ok) {
                         console.log("[Vercel] SUCCESS: Notification Sent", data);
                     } else {
                         console.error("[Vercel] ERROR: API Responded with", data);
                     }
                 })
                 .catch(e => console.error("[Vercel] ERROR: Network or Fetch failed", e));

            } else {
                 console.log("[Vercel] Skipped: Recipient active in room.");
            }
        }
    } catch (e: any) {
        console.error("[Vercel] Logic failed", e.message);
    }
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

      <div 
        ref={containerRef}
        onScroll={handleScroll}
        style={{ overflowAnchor: 'auto' }}
        className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar bg-background w-full"
      >
        {isLoadingOlder && (
            <div className="flex justify-center py-2">
                <div className="w-5 h-5 border-2 border-zinc-700 border-t-white rounded-full animate-spin"></div>
            </div>
        )}
        
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