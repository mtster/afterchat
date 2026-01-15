import React, { useEffect, useState, useRef } from 'react';
import { ref, push, onValue, serverTimestamp, get, child, update, onDisconnect, query, orderByChild, limitToLast, startAt, off, endBefore } from 'firebase/database';
import { db } from '../services/firebase';
import { getCachedMessages, saveMessageToCache, saveBatchMessages } from '../services/indexedDB';
import { Message, UserProfile, Roomer } from '../types';
import { Copy, Check } from 'lucide-react';

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
  
  // Long Press & Copy State
  const [activeMessageId, setActiveMessageId] = useState<string | null>(null);
  const [showCopiedToast, setShowCopiedToast] = useState(false);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    const disconnectRef = onDisconnect(userRef);
    disconnectRef.update({ activeRoom: null });

    const handleVisibility = () => {
        if (document.visibilityState === 'hidden') setStatus(null);
        else setStatus(roomId);
    };

    const handlePageHide = () => setStatus(null);

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

  // HYBRID DATA LOADING
  useEffect(() => {
    let unsubscribe: () => void;
    const messagesRef = ref(db, `messages/${roomId}`);

    const initData = async () => {
        const cached = await getCachedMessages(roomId);
        let startTimestamp = 0;

        if (cached.length > 0) {
            setMessages(cached);
            startTimestamp = cached[cached.length - 1].timestamp + 1;
            if (isInitialMount.current && containerRef.current) {
                setTimeout(() => {
                    if (containerRef.current) containerRef.current.scrollTop = containerRef.current.scrollHeight;
                }, 0);
            }
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
                    return [...prev, ...uniqueNew].sort((a, b) => a.timestamp - b.timestamp);
                });
            }
        });
        isInitialMount.current = false;
    };

    initData();
    return () => { if (unsubscribe) unsubscribe(); off(messagesRef); };
  }, [roomId]);

  const loadOlderMessages = async () => {
      if (messages.length === 0 || allLoaded) {
          setIsLoadingOlder(false);
          setPullOffset(0);
          return;
      }
      const oldestMsg = messages[0];
      try {
          const messagesRef = ref(db, `messages/${roomId}`);
          const q = query(messagesRef, orderByChild('timestamp'), endBefore(oldestMsg.timestamp), limitToLast(10));
          const snapshot = await get(q);
          if (snapshot.exists()) {
              const data = snapshot.val();
              const olderMessages = Object.entries(data).map(([key, val]: [string, any]) => ({ id: key, ...val })).sort((a, b) => a.timestamp - b.timestamp);
              if (olderMessages.length < 10) setAllLoaded(true);
              if (containerRef.current) previousScrollHeight.current = containerRef.current.scrollHeight;
              saveBatchMessages(roomId, olderMessages);
              setMessages(prev => [...olderMessages, ...prev]);
          } else {
              setAllLoaded(true);
          }
      } catch (e) {
          console.error("[Pagination] Error", e);
      } finally {
          setIsLoadingOlder(false);
          setPullOffset(0);
      }
  };

  // TOUCH & SCROLL HANDLERS (Pull to Refresh)
  const handleTouchStartScroll = (e: React.TouchEvent) => {
      if (!containerRef.current) return;
      if (containerRef.current.scrollTop <= 0) {
          touchStartY.current = e.touches[0].clientY;
          setIsPulling(true);
      } else {
          setIsPulling(false);
      }
  };

  const handleTouchMoveScroll = (e: React.TouchEvent) => {
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

  const handleTouchEndScroll = () => {
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

  // --- LONG PRESS LOGIC ---
  const handlePressStart = (id: string) => {
    // Clear any existing timer or state
    if (pressTimer.current) clearTimeout(pressTimer.current);
    setActiveMessageId(null);
    
    pressTimer.current = setTimeout(() => {
        setActiveMessageId(id);
        if (navigator.vibrate) navigator.vibrate(10); // Haptic feedback
    }, 500);
  };

  const handlePressEnd = () => {
    if (pressTimer.current) {
        clearTimeout(pressTimer.current);
        pressTimer.current = null;
    }
  };

  const handleCopyMessage = (text: string) => {
      navigator.clipboard.writeText(text).then(() => {
          setActiveMessageId(null);
          setShowCopiedToast(true);
          setTimeout(() => setShowCopiedToast(false), 2000);
      });
  };

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

    // Fire & Forget Notification
    try {
        get(child(ref(db), `roomers/${recipient.uid}`)).then(snapshot => {
            if (snapshot.exists()) {
                const val = snapshot.val();
                const targetToken = val.fcmToken;
                const recipientActiveRoom = val.activeRoom;
                const lastSeen = val.lastOnline || 0;
                const isStale = (Date.now() - lastSeen) > 30000;

                if (targetToken && (recipientActiveRoom !== roomId || isStale)) {
                     const myName = currentUser.displayName || 'Rooms User';
                     fetch('/api/notify', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            token: targetToken,
                            title: `New Message from ${myName}`,
                            body: text,
                            data: { roomId: roomId, senderId: currentUser.uid }
                        })
                     }).catch(err => console.error("Notify fail:", err));
                }
            }
        });
    } catch (e) {}
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
      
      {/* Copied Toast */}
      <div className={`fixed top-20 left-1/2 transform -translate-x-1/2 bg-zinc-800 text-white px-4 py-2 rounded-full shadow-xl z-50 flex items-center gap-2 transition-opacity duration-300 pointer-events-none border border-zinc-700 ${showCopiedToast ? 'opacity-100' : 'opacity-0'}`}>
         <Check size={14} className="text-green-400" />
         <span className="text-xs font-medium">Copied to clipboard</span>
      </div>

      {/* Header */}
      <div className="flex-none grid grid-cols-6 items-center px-4 py-3 border-b border-border bg-background/90 backdrop-blur-md sticky top-0 z-40" style={{ paddingTop: 'max(16px, env(safe-area-inset-top))' }}>
        <button onClick={handleBack} className="col-span-1 justify-self-start text-white p-2 -ml-2 active:opacity-50">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </button>
        <div className="col-span-4 flex flex-col items-center justify-center">
            <span className="font-semibold text-[17px] text-white truncate max-w-[200px]">{recipient.displayName}</span>
        </div>
        <div className="col-span-1" />
      </div>

      {/* Chat Container */}
      <div 
        ref={containerRef}
        className="flex-1 overflow-y-auto no-scrollbar bg-background w-full relative"
        style={{ overflowAnchor: 'auto', touchAction: 'pan-y' }}
        onTouchStart={handleTouchStartScroll}
        onTouchMove={handleTouchMoveScroll}
        onTouchEnd={handleTouchEndScroll}
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
                    <span className="text-[10px] uppercase tracking-widest text-zinc-600 font-bold">{pullOffset > PULL_THRESHOLD ? 'Release' : 'History'}</span>
                )}
            </div>
        </div>

        <div className="p-4 space-y-4 min-h-[101%]" onClick={() => setActiveMessageId(null)}> 
            {messages.map((msg) => {
              const isMe = msg.senderId === currentUser.uid;
              const isActive = activeMessageId === msg.id;

              return (
                <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'} relative group`}>
                   
                  {/* Message Bubble Wrapper with Events */}
                  <div 
                    className="relative"
                    onTouchStart={() => handlePressStart(msg.id)}
                    onTouchEnd={handlePressEnd}
                    onTouchMove={handlePressEnd}
                    onMouseDown={() => handlePressStart(msg.id)} // Desktop fallback
                    onMouseUp={handlePressEnd}
                    onMouseLeave={handlePressEnd}
                    style={{ WebkitTouchCallout: 'none' }}
                  >
                     {/* Copy Menu Popover */}
                     {isActive && (
                        <div className={`absolute z-50 ${isMe ? 'right-0' : 'left-0'} -top-12 animate-in fade-in slide-in-from-bottom-2 duration-200`}>
                            <button 
                                onClick={(e) => { e.stopPropagation(); handleCopyMessage(msg.text); }}
                                className="flex items-center gap-2 bg-zinc-800 text-white px-3 py-2 rounded-xl shadow-2xl border border-zinc-700 active:bg-zinc-700 whitespace-nowrap"
                            >
                                <Copy size={14} />
                                <span className="text-xs font-medium">Copy</span>
                            </button>
                            {/* Little triangle arrow */}
                            <div className={`absolute bottom-[-5px] w-3 h-3 bg-zinc-800 border-r border-b border-zinc-700 transform rotate-45 ${isMe ? 'right-4' : 'left-4'}`}></div>
                        </div>
                     )}

                     {/* The Message Bubble */}
                     <div 
                        className={`
                            max-w-[75vw] px-4 py-2 rounded-2xl text-[15px] leading-snug break-words transition-transform duration-200
                            ${isMe ? 'bg-blue-600 text-white rounded-tr-sm' : 'bg-zinc-800 text-zinc-100 rounded-tl-sm'}
                            ${isActive ? 'scale-105' : 'scale-100'}
                        `}
                     >
                        {formatMessageWithLinks(msg.text)}
                     </div>
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