importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-messaging-compat.js');

// Config for Service Worker
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
// Since we are sending a "notification" payload from Google Apps Script, 
// the browser should handle this automatically. 
// We include this listener just for logging/debugging.
messaging.onBackgroundMessage(async (payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  // No manual showNotification needed because 'notification' key in payload handles it.
});

// Handle notification click
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  // Open the app or focus window
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      // If a window is already open, focus it
      if (clientList.length > 0) {
        let client = clientList[0];
        // Focus the first available client
        return client.focus();
      }
      // Otherwise open new
      return clients.openWindow('/');
    })
  );
});