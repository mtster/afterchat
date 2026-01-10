# Onyx Chat - Developer Guide

## Project Overview
Onyx is an advanced Progressive Web App (PWA) built with React, Tailwind CSS, and Firebase.

## MANDATORY: Firebase Security Rules
Paste these into your Firebase Console to avoid PERMISSION_DENIED errors. 
**Note:** Added `displayName` to `.indexOn` for search functionality.

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

## Developer Notes
- **FCM**: The bell icon turns green once `roomers/$uid/fcmToken` is populated.
- **Node Names**: Always use `roomers` for user data and `addedRoomers` for contact lists.
- **Search**: Supports Email, Username (with $ prefix), and Display Name (exact match).
