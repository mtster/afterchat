import React, { useState } from 'react';
import { UserProfile } from '../types';
import { requestNotificationPermission, auth } from '../services/firebase';

interface ProfileProps {
  user: UserProfile;
}

const Profile: React.FC<ProfileProps> = ({ user }) => {
  const [notifStatus, setNotifStatus] = useState<string>('Enable Push Notifications');
  const [loading, setLoading] = useState(false);

  const handleEnableNotifications = async () => {
    setLoading(true);
    const token = await requestNotificationPermission(user.uid);
    setLoading(false);
    if (token) {
      setNotifStatus('Notifications Active');
    } else {
      setNotifStatus('Permission Denied or Error');
    }
  };

  const handleLogout = () => {
    auth.signOut();
  };

  return (
    <div className="flex flex-col h-full w-full bg-background p-6">
      <h1 className="text-3xl font-bold text-white mb-8">Profile</h1>
      
      <div className="flex flex-col items-center mb-10">
        <div className="relative w-32 h-32 rounded-full border-2 border-zinc-800 mb-4 p-1">
          <div className="w-full h-full rounded-full bg-zinc-800 overflow-hidden relative">
            {user.photoURL ? (
              <img src={user.photoURL} alt="Profile" className="w-full h-full object-cover" />
            ) : (
               <div className="w-full h-full flex items-center justify-center text-4xl text-zinc-500 font-light">
                 {user.displayName?.charAt(0) || 'U'}
               </div>
            )}
            
            {/* Simple file input overlay for "feature to add a profile picture" */}
            <input 
              type="file" 
              className="absolute inset-0 opacity-0 cursor-pointer"
              accept="image/*"
              onChange={(e) => alert("In a real app, this would upload to Firebase Storage.")}
            />
          </div>
          <div className="absolute bottom-0 right-0 bg-blue-600 w-8 h-8 rounded-full flex items-center justify-center border-2 border-black">
             <span className="text-white font-bold text-lg">+</span>
          </div>
        </div>
        
        <h2 className="text-xl font-semibold text-white">{user.displayName || 'Anonymous'}</h2>
        <p className="text-sm text-zinc-500">{user.email}</p>
      </div>

      <div className="space-y-4 w-full max-w-sm mx-auto">
        <div className="bg-surface rounded-xl p-4 border border-border flex items-center justify-between">
            <span className="text-white">Dark Mode</span>
            {/* Toggle Switch Visual */}
            <div className="w-12 h-7 bg-green-500 rounded-full relative cursor-not-allowed opacity-80">
                <div className="absolute right-1 top-1 w-5 h-5 bg-white rounded-full shadow-md"></div>
            </div>
        </div>

        <button 
          onClick={handleEnableNotifications}
          disabled={notifStatus === 'Notifications Active' || loading}
          className={`w-full py-4 rounded-xl font-medium transition-all active:scale-95 text-left px-4 flex justify-between items-center ${
            notifStatus === 'Notifications Active' 
              ? 'bg-zinc-900 text-green-500 border border-zinc-800' 
              : 'bg-zinc-100 text-black'
          }`}
        >
          {loading ? 'Requesting...' : notifStatus}
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
        </button>

        <button 
          onClick={handleLogout}
          className="w-full py-4 rounded-xl font-medium bg-red-900/20 text-red-500 border border-red-900/50 active:scale-95 transition-transform"
        >
          Log Out
        </button>
      </div>
    </div>
  );
};

export default Profile;