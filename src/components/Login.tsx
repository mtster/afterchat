import React from 'react';
import { loginWithGoogle, updateUserProfile } from '../services/firebase';

const Login: React.FC = () => {
  const handleLogin = async () => {
    try {
      const user = await loginWithGoogle();
      // Ensure user exists in DB
      if (user) {
        updateUserProfile(user.uid, {
          email: user.email,
          displayName: user.displayName,
          photoURL: user.photoURL,
          lastOnline: Date.now()
        });
      }
    } catch (error) {
      console.error("Login failed", error);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-full w-full bg-background p-6">
      <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-zinc-800 to-zinc-600 mb-8 animate-pulse" />
      <h1 className="text-3xl font-light tracking-tight text-white mb-2">Onyx</h1>
      <p className="text-muted text-sm mb-12">Pure, dark, seamless communication.</p>
      
      <button 
        onClick={handleLogin}
        className="w-full max-w-xs bg-white text-black font-medium h-12 rounded-full active:scale-95 transition-transform duration-200 flex items-center justify-center gap-2"
      >
        <span>Sign in with Google</span>
      </button>
    </div>
  );
};

export default Login;