import React from 'react';
import { signInWithPopup, signInWithRedirect, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { auth, googleProvider, updateUserProfile } from '../services/firebase';

const Login: React.FC = () => {
  
  const handleLogin = async () => {
    console.log("[Login] Button Clicked");
    try {
      // Check Environment
      const isIOSStandalone = (window.navigator as any).standalone === true;
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches || isIOSStandalone;
      
      console.log("[Login] Env Check:", { isStandalone, isIOSStandalone });

      // 1. CRITICAL: Await Persistence before any auth action
      await setPersistence(auth, browserLocalPersistence);
      console.log("[Login] Persistence Set to LOCAL");

      if (isStandalone) {
        console.log("[Login] Attempting Redirect (Standalone)");
        await signInWithRedirect(auth, googleProvider);
      } else {
        console.log("[Login] Attempting Popup (Browser)");
        const result = await signInWithPopup(auth, googleProvider);
        const user = result.user;
        
        console.log("[Login] Popup Success:", user.email);
        
        if (user) {
          updateUserProfile(user.uid, {
            email: user.email,
            displayName: user.displayName,
            photoURL: user.photoURL,
            lastOnline: Date.now()
          });
        }
      }
    } catch (error: any) {
      console.error("[Login] CRITICAL FAILURE:", error.code, error.message);
      
      let errorMessage = `Login Failed: ${error.message}`;

      if (error.code === 'auth/operation-not-allowed') {
        errorMessage = "CONFIG ERROR: Google Sign-In is disabled.";
      } else if (error.code === 'auth/unauthorized-domain') {
        errorMessage = "DOMAIN ERROR: This domain is not authorized.";
      } else if (error.code === 'auth/popup-closed-by-user') {
        errorMessage = "Sign-in cancelled.";
      }

      alert(errorMessage);
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