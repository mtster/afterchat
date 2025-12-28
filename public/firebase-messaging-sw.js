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

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  
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