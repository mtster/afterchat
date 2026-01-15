import React, { useEffect, useState, useRef } from 'react';
import { ref, push, onValue, serverTimestamp, get, child, update, onDisconnect, query, orderByChild, limitToLast, startAt, off, endBefore } from 'firebase/database';
import { db } from '../services/firebase';
import { getCachedMessages, saveMessageToCache, saveBatchMessages } from '../services/indexedDB';
import { Message, UserProfile, Roomer } from '../types';

interface ChatViewProps {
  roomId: string;
  recipient: Roomer;
  currentUser: UserProfile;
  onBack: () => void;
}

const PULL_THRESHOLD = 80;

const ChatView: React.FC<ChatViewProps> = ({ roomId, recipient, currentUser, onBack }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isVisible, setIsVisible] = useState(false);
  
  // Pull to Refresh State
  const [pullOffset, setPullOffset] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [allLoaded, setAllLoaded] = useState(false);
  
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  
  const isInitialMount = useRef(true);
  const touchStartY = useRef(0);
  const previousScrollHeight = useRef(0);
  
  const isAccepted = recipient.status === 'accepted';
  const isPendingOutgoing = recipient.status === 'pending_outgoing';
  const isPendingIncoming = recipient.status === 'pending_incoming';
  const isBlocked = !isAccepted && !isPendingOutgoing && !isPendingIncoming;

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 10);
    return () => clearTimeout(timer);
  }, []);

  // INSTANT PRESENCE & CLEANUP
  useEffect(() => {
    if (!currentUser.uid) return;
    const userRef = ref(db, `roomers/${currentUser.uid}`);
    
    const setStatus = (status: string | null) => { 
        update(userRef, { activeRoom: status, lastOnline: Date.now() }).catch(() => {}); 
    };

    setStatus(roomId);
    
    // 1. Server-side Disconnect (Crash/Socket Close)
    const disconnectRef = onDisconnect(userRef);
    disconnectRef.update({ activeRoom: null });

    // 2. Client-side Visibility (Tab Switch)
    const handleVisibility = () => {
        if (document.visibilityState === 'hidden') {
            setStatus(null);
        } else {
            setStatus(roomId);
        }
    };

    // 3. Client-side Unload/Background (iOS swipe away)
    // 'pagehide' is more reliable than 'unload' on iOS
    const handlePageHide = () => {
        // We try to send a final update. 
        // Note: Realtime Database SDK might not flush this in time if socket closes instantly,
        // but it is the best client-side attempt we can make without sendBeacon + REST API Auth complexity.
        setStatus(null);
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('pagehide', handlePageHide);
      disconnectRef.cancel();
      setStatus(null);
    };
  }, [roomId, currentUser.uid]);

  const handleBack = async () => {
    setIsVisible(false);
    await update(ref(db, `roomers/${currentUser.uid}`), { activeRoom: null });
    setTimeout(onBack, 300);
  };

  // HYBRID DATA LOADING: INDEXEDDB + NETWORK
  useEffect(() => {
    let unsubscribe: () => void;
    const messagesRef = ref(db, `messages/${roomId}`);

    const initData = async () => {
        console.log("[Data] Checking IndexedDB...");
        const cached = await getCachedMessages(roomId);
        
        let startTimestamp = 0;

        if (cached.length > 0) {
            console.log(`[Data] Loaded ${cached.length} messages from cache.`);
            setMessages(cached);
            startTimestamp = cached[cached.length - 1].timestamp + 1;
            
            if (isInitialMount.current && containerRef.current) {
                setTimeout(() => {
                    if (containerRef.current) containerRef.current.scrollTop = containerRef.current.scrollHeight;
                }, 0);
            }
        } else {
             console.log("[Data] No cache found. Doing full fresh load.");
        }

        let q;
        if (cached.length > 0) {
            q = query(messagesRef, orderByChild('timestamp'), startAt(startTimestamp));
        } else {
            q = query(messagesRef, orderByChild('timestamp'), limitToLast(25));
        }

        unsubscribe = onValue(q, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                const newMessages = Object.entries(data).map(([key, val]: [string, any]) => ({
                    id: key,
                    ...val
                })).sort((a, b) => a.timestamp - b.timestamp);
                
                saveBatchMessages(roomId, newMessages);

                setMessages(prev => {
                    const existingIds = new Set(prev.map(m => m.id));
                    const uniqueNew = newMessages.filter(m => !existingIds.has(m.id));
                    
                    if (uniqueNew.length === 0) return prev;
                    
                    console.log(`[Data] Received ${uniqueNew.length} new messages from network.`);
                    return [...prev, ...uniqueNew].sort((a, b) => a.timestamp - b.timestamp);
                });
            }
        }, (error: any) => {
             console.error(`[DB_Network_Error] Code: ${error.code}, Message: ${error.message}`);
             if (error.code === 'PERMISSION_DENIED') {
                 console.error("[DB_Network_Error] Permission Denied. Check your Firebase Rules for 'messages' node.");
             }
        });
        
        isInitialMount.current = false;
    };

    initData();

    return () => {
        if (unsubscribe) unsubscribe();
        off(messagesRef);
    };
  }, [roomId]);

  const loadOlderMessages = async () => {
      if (messages.length === 0 || allLoaded) {
          setIsLoadingOlder(false);
          setPullOffset(0);
          return;
      }

      const oldestMsg = messages[0];
      console.log(`[Pagination] Fetching older than ${oldestMsg.timestamp}`);

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

              console.log(`[Pagination] Retrieved ${olderMessages.length} older messages.`);

              if (olderMessages.length < 10) setAllLoaded(true);

              if (containerRef.current) {
                  previousScrollHeight.current = containerRef.current.scrollHeight;
              }

              saveBatchMessages(roomId, olderMessages);
              setMessages(prev => [...olderMessages, ...prev]);
          } else {
              console.log("[Pagination] No more history.");
              setAllLoaded(true);
          }
      } catch (e) {
          console.error("[Pagination] Error", e);
      } finally {
          setIsLoadingOlder(false);
          setPullOffset(0);
      }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
      if (!containerRef.current) return;
      if (containerRef.current.scrollTop <= 0) {
          touchStartY.current = e.touches[0].clientY;
          setIsPulling(true);
      } else {
          setIsPulling(false);
      }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
      if (!isPulling || !containerRef.current) return;
      const currentY = e.touches[0].clientY;
      const diff = currentY - touchStartY.current;
      if (diff > 0 && containerRef.current.scrollTop <= 0 && !isLoadingOlder && !allLoaded) {
          const resistedDiff = Math.min(diff * 0.4, 150); 
          setPullOffset(resistedDiff);
          if (e.cancelable) e.preventDefault(); 
      } else {
          setPullOffset(0);
      }
  };

  const handleTouchEnd = () => {
      if (!isPulling) return;
      setIsPulling(false);
      if (pullOffset > PULL_THRESHOLD) {
          setIsLoadingOlder(true);
          setPullOffset(50);
          loadOlderMessages();
      } else {
          setPullOffset(0);
      }
  };

  useEffect(() => {
    if (previousScrollHeight.current > 0 && containerRef.current) {
        const newScrollHeight = containerRef.current.scrollHeight;
        const diff = newScrollHeight - previousScrollHeight.current;
        containerRef.current.scrollTop = diff;
        previousScrollHeight.current = 0;
    } 
    else if (!isLoadingOlder && bottomRef.current && !isInitialMount.current && pullOffset === 0) {
        bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoadingOlder, pullOffset]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = inputText.trim();
    if (!text || !isAccepted) return;

    setInputText('');
    if (inputRef.current) inputRef.current.focus();

    const newMessage: any = {
      senderId: currentUser.uid,
      senderName: currentUser.displayName || 'User',
      text: text,
      timestamp: serverTimestamp()
    };

    const messagesRef = ref(db, `messages/${roomId}`);
    const newRef = await push(messagesRef, newMessage);
    
    if (newRef.key) {
        saveMessageToCache(roomId, { id: newRef.key, ...newMessage, timestamp: Date.now() });
    }

    try {
        console.log(`[Notify] Checking recipient details for: ${recipient.uid}`);
        const snapshot = await get(child(ref(db), `roomers/${recipient.uid}`));
        if (snapshot.exists()) {
            const val = snapshot.val();
            const targetToken = val.fcmToken;
            const recipientActiveRoom = val.activeRoom;
            
            // Stale Detection
            const lastSeen = val.lastOnline || 0;
            const timeDiff = Date.now() - lastSeen;
            const isStale = timeDiff > 30000; // 30 seconds
            
            console.log(`[Notify] Recipient Active Room: ${recipientActiveRoom}`);
            console.log(`[Notify] Recipient Last Online: ${Math.round(timeDiff/1000)}s ago (Stale: ${isStale})`);
            console.log(`[Notify] Target Token: ${targetToken ? 'Present' : 'MISSING'}`);

            // NOTIFY IF: (Token Exists) AND ( (Not in room) OR (In room but Stale) )
            if (targetToken && (recipientActiveRoom !== roomId || isStale)) {
                 const mySnapshot = await get(child(ref(db), `roomers/${currentUser.uid}`));
                 const myData = mySnapshot.exists() ? mySnapshot.val() : {};
                 const displayName = myData.displayName || currentUser.displayName || 'Rooms User';
                 
                 // USE RELATIVE PATH to avoid CORS on preview deployments
                 const endpoint = '/api/notify';

                 console.log(`[Notify] TRIGGERING Notification via ${endpoint}...`);

                 fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        token: targetToken,
                        title: `New Message from ${displayName}`,
                        body: text,
                        data: { roomId: roomId, senderId: currentUser.uid }
                    })
                 })
                 .then(async res => {
                     console.log(`[Notify] Fetch Response Status: ${res.status}`);
                     if (!res.ok) {
                         const errText = await res.text();
                         console.error(`[Notify] HTTP Error: ${errText}`);
                         return;
                     }
                     const data = await res.json();
                     console.log("[Notify] SUCCESS:", data);
                 })
                 .catch(error => {
                     console.error("[Notify] Fetch FAILED");
                     const errObj = Object.getOwnPropertyNames(error).reduce((acc, key) => {
                        acc[key] = (error as any)[key];
                        return acc;
                     }, {} as any);
                     console.error(`[Notify] Details:`, JSON.stringify(errObj));
                 });

            } else {
                 console.log("[Notify] Skipped: Recipient is active in room and not stale.");
            }
        } else {
            console.warn("[Notify] Recipient profile not found in DB.");
        }
    } catch (e: any) {
        console.error("[Notify] Logic failed", e.message);
    }
  };

  const formatMessageWithLinks = (text: string) => {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = text.split(urlRegex);
    return parts.map((part, index) => {
      if (part.match(urlRegex)) {
        return (
          <a key={index} href={part} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 break-all cursor-pointer opacity-90 hover:opacity-100" onClick={(e) => e.stopPropagation()}>{part}</a>
        );
      }
      return part;
    });
  };

  return (
    <div className={`flex flex-col h-[100dvh] w-screen bg-background fixed inset-0 z-20 transition-transform duration-300 ease-in-out ${isVisible ? 'translate-x-0' : 'translate-x-full'}`}>
      
      {/* Header */}
      <div className="flex-none grid grid-cols-6 items-center px-4 py-3 border-b border-border bg-background/90 backdrop-blur-md sticky top-0 z-50" style={{ paddingTop: 'max(16px, env(safe-area-inset-top))' }}>
        <button onClick={handleBack} className="col-span-1 justify-self-start text-white p-2 -ml-2 active:opacity-50">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </button>
        <div className="col-span-4 flex flex-col items-center justify-center">
            <span className="font-semibold text-[17px] text-white truncate max-w-[200px]">{recipient.displayName}</span>
        </div>
        <div className="col-span-1" />
      </div>

      {/* Chat Container with Touch Listeners */}
      <div 
        ref={containerRef}
        className="flex-1 overflow-y-auto no-scrollbar bg-background w-full relative"
        style={{ overflowAnchor: 'auto', touchAction: 'pan-y' }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div 
            style={{ 
                height: `${pullOffset}px`, 
                overflow: 'hidden',
                transition: isPulling ? 'none' : 'height 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)' 
            }}
            className="w-full flex items-end justify-center pb-2 bg-background/50"
        >
            <div className="flex flex-col items-center gap-1 opacity-80">
                {isLoadingOlder ? (
                    <div className="w-5 h-5 border-2 border-zinc-600 border-t-white rounded-full animate-spin"></div>
                ) : (
                    <>
                        <svg className={`w-5 h-5 text-zinc-500 transition-transform duration-200 ${pullOffset > PULL_THRESHOLD ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>
                        <span className="text-[10px] uppercase tracking-widest text-zinc-600 font-bold">
                            {pullOffset > PULL_THRESHOLD ? 'Release to Load' : 'Pull for History'}
                        </span>
                    </>
                )}
            </div>
        </div>

        <div className="p-4 space-y-4 min-h-[101%]"> 
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
      </div>

      {/* Input Area */}
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