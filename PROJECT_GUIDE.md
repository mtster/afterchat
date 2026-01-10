# Onyx Chat - Developer Guide

## Project Overview
Onyx is an advanced Progressive Web App (PWA) built with React, Tailwind CSS, and Firebase. It is designed for seamless, real-time communication on iOS and Android.

## File Structure
- `src/index.tsx`: Main entry point. Handles Service Worker registration.
- `src/App.tsx`: State orchestrator. Manages view navigation, auth hydration, and global data caching (Roomers List).
- `src/services/firebase.ts`: Singleton configurations for Auth, Realtime Database, and Cloud Messaging (FCM). Contains all business logic for DB operations.
- `src/components/`:
    - `RoomsList.tsx`: Main dashboard. Shows active chats and incoming/outgoing roomer requests.
    - `ChatView.tsx`: Real-time messaging interface. Handles instant presence tracking and notification triggers via Google Apps Script proxy.
    - `ProfileView.tsx`: User profile management (usernames, settings, sign out).
    - `Login.tsx`: Multi-method authentication (Email/Google).
    - `DebugConsole.tsx`: On-device diagnostic tool for testing PWAs without browser dev tools.

## Realtime Database Schema
```json
{
  "roomers": {
    "UID_HERE": {
      "displayName": "User Name",
      "email": "user@example.com",
      "username": "$Username",
      "fcmToken": "FIREBASE_MESSAGING_TOKEN",
      "activeRoom": "ROOM_ID_OR_NULL",
      "lastOnline": 1700000000,
      "addedRoomers": {
        "TARGET_UID": "accepted | pending"
      },
      "pendingApprovals": {
        "TARGET_UID": true
      }
    }
  },
  "rooms": {
    "UID1_UID2": {
      "messages": {
        "MSG_ID": {
          "senderId": "UID",
          "text": "Hello world",
          "timestamp": 1700000000
        }
      }
    }
  }
}
```

## Notification Architecture
1. **Trigger**: When a user sends a message in `ChatView.tsx`, the client checks if the recipient is in the same room.
2. **Proxy**: If the recipient is away/offline, a JSON payload is sent to a Google Apps Script Web App.
3. **Delivery**: The Apps Script converts the payload into an FCM v1 API call with the project's Service Account credentials.
4. **Display**: 
    - **Background**: Handled by `public/firebase-messaging-sw.js` (System Notification).
    - **Foreground**: Handled by `App.tsx` using the `onMessageListener` (Browser Notification API).

## Key Developer Notes
- **Presence**: The `activeRoom` node is critical for preventing double-notifications. It is cleared instantly when a user exits a chat.
- **Node Names**: Ensure all database paths use `roomers` and `addedRoomers`.
- **Safe Areas**: All headers/footers use `env(safe-area-inset-*)` CSS variables to support iPhone notches.
