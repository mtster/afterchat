importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-messaging-compat.js');

// Hardcoded Config for Service Worker
// NOTE: Make sure these match your project settings
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

// Handles background messages.
// Note: If the payload contains a 'notification' key, the browser handles the notification
// automatically, and this callback may not be invoked (or may be invoked after).
// We use this primarily if we need to handle data-only messages in background
// or want to override behavior (though browser behavior for 'notification' key is dominant).
messaging.onBackgroundMessage(async (payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);

  // If the payload is data-only (no 'notification' key), we must show it manually.
  // If it HAS a 'notification' key, the browser shows it.
  if (payload.data && !payload.notification) {
      const notificationTitle = payload.data.title || "New Message";
      const notificationOptions = {
        body: payload.data.body,
        icon: '/icon-192.png'
      };
      
      return self.registration.showNotification(notificationTitle, notificationOptions);
  }
});