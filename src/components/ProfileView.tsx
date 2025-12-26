import React, { useState } from 'react';
import { UserProfile } from '../types';
import { updateUserProfile, auth } from '../services/firebase';

interface Props {
  currentUser: UserProfile;
  onBack: () => void;
}

export default function ProfileView({ currentUser, onBack }: Props) {
  const [username, setUsername] = useState(currentUser.username || '$');
  const [saving, setSaving] = useState(false);

  const handleSaveUsername = async () => {
    if (!username.startsWith('$') || username.length < 2) {
        alert("Username must start with $ and be at least 2 characters.");
        return;
    }
    setSaving(true);
    try {
        await updateUserProfile(currentUser.uid, { username });
        alert("Username updated!");
    } catch (e) {
        alert("Failed to update.");
    }
    setSaving(false);
  };

  const handleSignOut = () => {
    auth.signOut();
    window.location.reload();
  };

  return (
    <div className="flex flex-col h-full w-full bg-black z-30 fixed inset-0">
       {/* Header */}
       <div className="pt-safe-top px-4 py-3 flex items-center border-b border-zinc-800">
        <button onClick={onBack} className="text-zinc-400 hover:text-white mr-4">
            <span className="text-lg">Close</span>
        </button>
        <span className="font-semibold text-lg flex-1 text-center pr-12">Profile</span>
      </div>

      <div className="p-6 flex flex-col items-center">
        {/* Avatar */}
        <div className="w-24 h-24 rounded-full bg-zinc-800 mb-4 overflow-hidden border-2 border-zinc-800">
             {currentUser.photoURL ? (
                <img src={currentUser.photoURL} alt="Me" className="w-full h-full object-cover" />
             ) : (
                <div className="w-full h-full flex items-center justify-center">
                    <svg className="w-12 h-12 text-zinc-600" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" /></svg>
                </div>
             )}
        </div>

        <h2 className="text-xl font-bold text-white mb-1">{currentUser.displayName}</h2>
        <p className="text-zinc-500 text-sm mb-8">{currentUser.email}</p>

        {/* Settings Form */}
        <div className="w-full max-w-md space-y-6">
            <div>
                <label className="block text-xs font-bold text-zinc-500 uppercase mb-2 ml-1">Username</label>
                <div className="flex gap-2">
                    <input 
                        type="text" 
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:border-white focus:outline-none transition-colors"
                        placeholder="$Username"
                    />
                    <button 
                        onClick={handleSaveUsername}
                        disabled={saving || username === currentUser.username}
                        className="bg-white text-black px-4 rounded-xl font-bold text-sm disabled:opacity-50"
                    >
                        {saving ? '...' : 'Save'}
                    </button>
                </div>
                <p className="text-[10px] text-zinc-600 mt-2 ml-1">Usernames allow people to find you without your email.</p>
            </div>

            <div className="pt-8 border-t border-zinc-900">
                <button 
                    onClick={handleSignOut}
                    className="w-full py-4 text-red-500 font-medium bg-zinc-900/30 rounded-xl hover:bg-zinc-900 transition-colors"
                >
                    Sign Out
                </button>
            </div>
        </div>
      </div>
    </div>
  );
}