import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as admin from 'firebase-admin';

// Initialize Firebase Admin SDK if not already initialized
if (!admin.apps.length) {
  try {
    const serviceAccount = {
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      // Handle newline characters in private key for Vercel Env Vars
      privateKey: process.env.FIREBASE_PRIVATE_KEY 
        ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') 
        : undefined,
    };

    if (!serviceAccount.projectId || !serviceAccount.clientEmail || !serviceAccount.privateKey) {
        throw new Error("Missing Firebase Admin Environment Variables");
    }

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  } catch (error) {
    console.error('Firebase Admin Init Error:', error);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { token, title, body, data } = req.body;

    if (!token || !title || !body) {
      return res.status(400).json({ error: 'Missing token, title, or body' });
    }

    const message = {
      token: token,
      notification: {
        title: title,
        body: body,
      },
      // Optional data payload
      data: data || {},
      // Android specific config for high priority
      android: {
        priority: 'high' as const,
        notification: {
          icon: 'icon_192',
          color: '#000000'
        }
      },
      // APNS (Apple) specific config
      apns: {
        payload: {
          aps: {
            contentAvailable: true,
            sound: 'default'
          }
        }
      }
    };

    const response = await admin.messaging().send(message);
    
    return res.status(200).json({ success: true, messageId: response });
  } catch (error: any) {
    console.error('FCM Send Error:', error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}