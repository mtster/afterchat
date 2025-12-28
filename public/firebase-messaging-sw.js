importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-messaging-compat.js');

// Hardcoded Config for Service Worker (Static File)
const firebaseConfig = {
  apiKey: "AIzaSyDySZZawrO-SMWtEEYlQJca82uxr9uDPt0",
  authDomain: "afterchat.firebaseapp.com",
  projectId: "afterchat",
  storageBucket: "afterchat.firebasestorage.app",
  messagingSenderId: "78791482786",
  appId: "1:78791482786:web:59dc1d8d5bcdcc76d2a6fb"
};

firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

messaging.onBackgroundMessage(async (payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  
  // Prevent duplicate notifications if the app is visible (even if not strictly focused)
  // This helps when the user is looking at the app but it might be considered 'background' by some definitions
  // or if using data-only messages which bypass default suppression.
  try {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const isAppVisible = clients.some(client => client.visibilityState === 'visible');
    
    if (isAppVisible) {
      console.log('[firebase-messaging-sw.js] App is visible, suppressing notification.');
      return;
    }
  } catch (e) {
    console.error('[firebase-messaging-sw.js] Failed to check client visibility', e);
  }

  // We now use data-only payloads to prevent duplicate notifications 
  // (browser defaults vs service worker).
  if (payload.data) {
    const notificationTitle = payload.data.title;
    const notificationOptions = {
      body: payload.data.body,
      icon: '/icon-192.png',
      // badge: '/badge.png'
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
  }
});