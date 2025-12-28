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

// Handles background messages (when app is closed or hidden)
messaging.onBackgroundMessage(async (payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);

  // Fallback default values
  let title = "Onyx Message";
  let body = "You have a new message.";

  // Extract from data payload (preferred for PWAs to force wake-up)
  if (payload.data) {
      title = payload.data.title || title;
      body = payload.data.body || body;
  } 
  // Extract from notification payload (if present)
  else if (payload.notification) {
      title = payload.notification.title || title;
      body = payload.notification.body || body;
  }

  const notificationOptions = {
    body: body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: 'onyx-message',
    renotify: true,
    data: payload.data // Pass data to click handler if needed later
  };
  
  // Explicitly show notification to ensure it appears
  return self.registration.showNotification(title, notificationOptions);
});

// Optional: Handle notification click
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  // Open the app
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      if (clientList.length > 0) {
        let client = clientList[0];
        for (let i = 0; i < clientList.length; i++) {
          if (clientList[i].focused) {
            client = clientList[i];
          }
        }
        return client.focus();
      }
      return clients.openWindow('/');
    })
  );
});