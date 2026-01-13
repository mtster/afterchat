import React, { useState } from 'react';
import { signInWithPopup, signInWithRedirect, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { auth, googleProvider, updateUserProfile, signInWithEmail, signUpWithEmail } from '../services/firebase';

const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  
  const handleGoogleLogin = async () => {
    try {
      const isIOSStandalone = (window.navigator as any).standalone === true;
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches || isIOSStandalone;
      await setPersistence(auth, browserLocalPersistence);

      if (isStandalone) {
        await signInWithRedirect(auth, googleProvider);
      } else {
        const result = await signInWithPopup(auth, googleProvider);
        const user = result.user;
        if (user) {
          await updateUserProfile(user.uid, {
            email: user.email,
            displayName: user.displayName,
            photoURL: user.photoURL,
            lastOnline: Date.now()
          });
        }
      }
    } catch (error: any) {
      alert(error.message);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    
    setLoading(true);
    try {
      await setPersistence(auth, browserLocalPersistence);
      
      let userCred;
      if (isSignUp) {
        userCred = await signUpWithEmail(email, password);
      } else {
        userCred = await signInWithEmail(email, password);
      }
      
      const user = userCred.user;
      if (user) {
        // New account profile creation
        await updateUserProfile(user.uid, {
          email: user.email,
          displayName: user.displayName || email.split('@')[0],
          photoURL: user.photoURL,
          lastOnline: Date.now()
        });
      }
    } catch (error: any) {
      let msg = error.message;
      if (error.code === 'auth/invalid-credential') msg = "Invalid email or password.";
      if (error.code === 'PERMISSION_DENIED') msg = "Access Denied. Ensure Firebase Rules are updated for 'roomers' node.";
      alert(msg);
    }
    setLoading(false);
  };

  return (
    <div className="flex flex-col items-center justify-center h-full w-full bg-background p-6">
      <div className="w-24 h-24 rounded-full bg-zinc-900 mb-8 overflow-hidden border border-zinc-800 shadow-2xl shadow-white/5">
        <img src="/public/icon-512.png" alt="Rooms Icon" className="w-full h-full object-cover" />
      </div>
      <h1 className="text-4xl font-bold tracking-tight text-white mb-2">Rooms</h1>
      <p className="text-muted text-sm mb-8">Advanced, dark, seamless communication.</p>
      
      <form onSubmit={handleEmailAuth} className="w-full max-w-xs flex flex-col gap-3 mb-6">
        <input 
          type="email" 
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white placeholder-zinc-600 focus:border-zinc-500 focus:outline-none transition-colors"
          required
        />
        <input 
          type="password" 
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white placeholder-zinc-600 focus:border-zinc-500 focus:outline-none transition-colors"
          required
        />
        <button 
          type="submit"
          disabled={loading}
          className="w-full bg-white text-black font-bold h-12 rounded-xl active:scale-95 transition-transform duration-200 flex items-center justify-center mt-2 disabled:opacity-70"
        >
          {loading ? 'Processing...' : (isSignUp ? 'Create Account' : 'Sign In')}
        </button>
      </form>

      <div className="flex items-center w-full max-w-xs mb-6">
        <div className="flex-1 h-px bg-zinc-800"></div>
        <span className="px-3 text-xs text-zinc-600 uppercase">Or</span>
        <div className="flex-1 h-px bg-zinc-800"></div>
      </div>
      
      <button 
        onClick={handleGoogleLogin}
        className="w-full max-w-xs bg-zinc-800 text-white font-medium h-12 rounded-xl active:scale-95 transition-transform duration-200 flex items-center justify-center gap-2 border border-zinc-700"
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
        <span>Sign in with Google</span>
      </button>

      <button 
        onClick={() => setIsSignUp(!isSignUp)}
        className="mt-8 text-sm text-zinc-500 hover:text-white transition-colors"
      >
        {isSignUp ? "Already have an account? Sign In" : "Don't have an account? Create one"}
      </button>
    </div>
  );
};

export default Login;
