# Rooms - Project Technical Documentation

Rooms is a high-performance Progressive Web Application (PWA) designed for real-time, all-black aesthetic messaging. It utilizes a modern stack to provide a native-like experience on both iOS and Android.

---

## 🛠 Tech Stack

1. **Frontend Framework**: **React 19** - Utilizing the latest Concurrent Mode features and Hooks.
2. **Styling**: **Tailwind CSS** - Used for rapid, utility-first UI development and dark-mode management.
3. **Icons**: **Lucide React** - Clean, consistent vector icons.
4. **Backend**: **Firebase**
   - **Authentication**: Email/Password and Google Sign-In.
   - **Realtime Database (RTDB)**: Low-latency JSON data storage for messages and presence.
   - **Cloud Messaging (FCM)**: Push notifications for background/foreground alerts.
5. **Build Tool**: **Vite** - For fast development and optimized production bundling.
6. **Persistence**: **PWA / Service Workers** - Offline support and native "Add to Home Screen" capabilities.

---

## 📁 File & Folder Structure

### Root Directory
- `index.html`: Entry point. Sets up the viewport for iOS safe areas and injects the app.
- `manifest.json`: Defines PWA behavior (name, icons, start URL).
- `vite.config.ts`: Configuration for Vite, handling builds and plugins.
- `package.json`: Project dependencies and scripts.
- `metadata.json`: Used by the development environment for permissions (camera, etc.).
- `vercel.json`: Configuration for deployment and URL rewrites.

### src/ Folder
- `index.tsx`: Main entry point for React. Registers the Service Worker.
- `App.tsx`: Central logic. Handles Auth state, view routing, and global data sync.
- `types.ts`: TypeScript interfaces for Users, Messages, and Rooms.
- `index.css`: Global styles including Tailwind directives and iOS Safe Area overrides.

### src/services/ Folder
- `firebase.ts`: The core "brain" of the app. Initializes Firebase, handles Authentication, Database queries (Search, Add, Delete), and FCM Token management.

### src/components/ Folder
- `Login.tsx`: Authentication screen.
- `RoomsList.tsx`: Main dashboard showing contacts and active chats. Includes "Add Roomer" logic.
- `ChatView.tsx`: Real-time messaging screen. Manages "activeRoom" presence and push notification triggers.
- `ProfileView.tsx`: User profile management (Username setting, Theme toggle, Delete contacts).
- `DebugConsole.tsx`: Fixed overlay for developers to track real-time logs and errors in-app.
- `ErrorBoundary.tsx`: Catches fatal React crashes and provides a graceful recovery UI.

### public/ Folder
- `firebase-messaging-sw.js`: The Service Worker that handles background push notifications.
- `icon-192.png` / `icon-512.png`: Branding icons.

---

## 🗄 Firebase Database Structure (RTDB)

Data is structured in a flat, high-performance JSON hierarchy:

### 1. `roomers/` (User Profiles)
Stores user data and relationship statuses.
```json
{
  "roomers": {
    "$uid": {
      "displayName": "Full Name",
      "email": "user@example.com",
      "photoURL": "https://...",
      "username": "$Username",
      "fcmToken": "FCM_PUSH_TOKEN",
      "lastOnline": 1625000000000,
      "activeRoom": "uid1_uid2", // The room ID the user is currently viewing (for "instant" presence)
      "addedRoomers": {
        "$contactUid": "accepted" // Or "pending"
      },
      "pendingApprovals": {
        "$requesterUid": true
      }
    }
  }
}
```

### 2. `rooms/` (Messages)
Stores the actual chat content.
```json
{
  "rooms": {
    "$roomId": { // Format: lowerUid_higherUid (alphabetical)
      "messages": {
        "$messageId": {
          "senderId": "$uid",
          "senderName": "Display Name",
          "text": "Message content",
          "timestamp": 1625000000000
        }
      }
    }
  }
}
```

---

## 🔒 Mandatory Security Rules
To enable search indexing and secure data access, use these rules in the Firebase Console:

```json
{
  "rules": {
    "roomers": {
      ".read": "auth != null",
      ".indexOn": ["email", "username", "displayName"],
      "$uid": {
        ".write": "$uid === auth.uid",
        "addedRoomers": {
          "$contactId": {
            ".write": "$uid === auth.uid || (auth != null && $contactId === auth.uid)"
          }
        },
        "pendingApprovals": {
          "$requesterId": {
            ".write": "auth != null"
          }
        }
      }
    },
    "rooms": {
      ".read": "auth != null",
      ".write": "auth != null"
    }
  }
}
```

---

## 🚀 Key Features

- **Instant Presence**: Using `visibilitychange` and `activeRoom` nodes, the app knows exactly when a user is looking at a specific chat.
- **Push Notifications**: When a user sends a message, it triggers a fetch to a Google Apps Script relay, which sends an FCM notification only if the recipient is *not* currently viewing that room.
- **Deep Search**: Users can find each other via exact Email, exact Display Name, or Username (starts with $).
- **iOS Optimized**: Viewports use `interactive-widget=resizes-content` to prevent keyboard layout shifting and support safe areas for the notch.