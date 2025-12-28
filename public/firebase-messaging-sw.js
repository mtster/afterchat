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
// We are using DATA ONLY payloads now to ensure the Service Worker always fires.
messaging.onBackgroundMessage(async (payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);

  // Check for data property
  if (payload.data) {
      const notificationTitle = payload.data.title || "Rooms";
      const notificationBody = payload.data.body || "New Message";
      
      const notificationOptions = {
        body: notificationBody,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: 'message-notification', // Overwrites previous notifications
        renotify: true
      };
      
      return self.registration.showNotification(notificationTitle, notificationOptions);
  }
});