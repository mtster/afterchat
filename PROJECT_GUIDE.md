# Onyx Chat - Developer Guide

## Project Overview
Onyx is an advanced Progressive Web App (PWA) built with React, Tailwind CSS, and Firebase.

## MANDATORY: Firebase Security Rules
Paste these into your Firebase Console to avoid PERMISSION_DENIED errors.

```json
{
  "rules": {
    "roomers": {
      ".read": "auth != null",
      ".indexOn": ["email", "username"],
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

## Realtime Database Schema
```json
{
  "roomers": {
    "UID": {
      "displayName": "Name",
      "email": "email@example.com",
      "username": "$Username",
      "fcmToken": "TOKEN",
      "activeRoom": "ROOM_ID",
      "addedRoomers": {
        "OTHER_UID": "accepted | pending"
      },
      "pendingApprovals": {
        "OTHER_UID": true
      }
    }
  },
  "rooms": {
    "UID_UID": {
      "messages": { ... }
    }
  }
}
```

## Developer Notes
- **FCM**: The bell icon turns green once `roomers/$uid/fcmToken` is populated.
- **Node Names**: Always use `roomers` for user data and `addedRoomers` for contact lists.
- **Safe Areas**: UI is notch-safe using `env(safe-area-inset-*)`.
