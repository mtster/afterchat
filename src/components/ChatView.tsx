import React, { useEffect, useState, useRef } from 'react';
import { ref, push, onValue, serverTimestamp } from 'firebase/database';
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
  const bottomRef = useRef<HTMLDivElement>(null);

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
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    const messageContent = inputText;
    const messagesRef = ref(db, `rooms/${roomId}/messages`);
    
    // 1. Save to Firebase
    await push(messagesRef, {
      senderId: currentUser.uid,
      senderName: currentUser.displayName || 'User',
      text: messageContent,
      timestamp: serverTimestamp()
    });

    // 2. Trigger Instant Notification via Google Apps Script (Optional)
    const GAS_URL = "https://script.google.com/macros/s/AKfycbzi-1KXALb-CqR2iDAFHiJcXs6P6cnHgRmP_-Kzdgktz0xkhWLfIdott8fGHBVByrfkag/exec";
    try {
        fetch(GAS_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: messageContent, sender: currentUser.displayName || 'User' })
        });
    } catch (err) {
        console.warn("Failed to trigger notification:", err);
    }

    setInputText('');
  };

  return (
    <div className="flex flex-col h-full w-full bg-background fixed inset-0 z-20">
      {/* Header */}
      <div className="flex items-center px-2 py-3 border-b border-border bg-background/90 backdrop-blur-md pt-safe-top">
        <button 
          onClick={onBack}
          className="flex items-center text-blue-500 px-2 py-1 active:opacity-50"
        >
          <svg className="w-6 h-6 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          <span className="text-[17px]">Rooms</span>
        </button>
        
        <div className="flex-1 flex flex-col items-center justify-center mr-10">
            <span className="font-semibold text-[17px]">{recipient.displayName}</span>
            <span className="text-[10px] text-zinc-500">{recipient.username || recipient.email}</span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar">
        {messages.map((msg) => {
          const isMe = msg.senderId === currentUser.uid;
          return (
            <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
              <div 
                className={`max-w-[75%] px-4 py-2 rounded-2xl text-[15px] leading-snug ${
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
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-3 bg-zinc-900 border-t border-border pb-safe-bottom">
        <form onSubmit={handleSend} className="flex gap-2">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Message"
            className="flex-1 bg-black border border-zinc-700 rounded-full px-4 py-2 text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500 transition-colors"
          />
          <button 
            type="submit"
            disabled={!inputText.trim()}
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
              inputText.trim() ? 'bg-blue-600 text-white active:scale-95' : 'bg-zinc-800 text-zinc-500'
            }`}
          >
            <svg className="w-5 h-5 ml-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
};

export default ChatView;