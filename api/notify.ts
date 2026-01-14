import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as admin from 'firebase-admin';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  console.log('Sending FCM via Vercel...');

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 1. Initialize Firebase Admin (Only if not already initialized)
    if (!admin.apps.length) {
      const projectId = process.env.FIREBASE_PROJECT_ID;
      const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
      let privateKey = process.env.FIREBASE_PRIVATE_KEY;

      // Log configuration status (DO NOT log the actual key)
      console.log(`[Config] Project: ${projectId}`);
      console.log(`[Config] Email: ${clientEmail}`);
      console.log(`[Config] Key Length: ${privateKey ? privateKey.length : 'MISSING'}`);

      if (!projectId || !clientEmail || !privateKey) {
          throw new Error("Missing Firebase Admin Environment Variables");
      }

      // CRITICAL: Fix Vercel Environment Variable newlines
      // If the key is wrapped in quotes in Vercel UI, the \n might be literal characters.
      if (privateKey) {
        privateKey = privateKey.replace(/\\n/g, '\n');
      }

      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      });
      console.log("[Config] Firebase Admin Initialized Successfully");
    }

    const { token, title, body, data } = req.body;

    if (!token || !title || !body) {
      return res.status(400).json({ error: 'Missing token, title, or body' });
    }

    const finalBody = `🚀 ${body}`;

    const message = {
      token: token,
      notification: {
        title: title,
        body: finalBody,
      },
      data: data || {},
      android: {
        priority: 'high' as const,
        notification: {
          icon: 'icon_192',
          color: '#000000'
        }
      },
      apns: {
        payload: {
          aps: {
            contentAvailable: true,
            sound: 'default'
          }
        }
      }
    };

    console.log(`[API] Sending to: ${token.slice(0, 10)}...`);
    const response = await admin.messaging().send(message);
    console.log(`[API] Success Message ID: ${response}`);
    
    return res.status(200).json({ success: true, messageId: response });
  } catch (error: any) {
    // Robust Error Logging
    console.error('[API] FCM Fatal Error:', error);
    
    // Create a plain object from the error to ensure it stringifies correctly in logs
    const errorLog = {
      message: error.message,
      stack: error.stack,
      code: error.code,
      details: error.errorInfo || error
    };
    
    console.error('[API] Error Details:', JSON.stringify(errorLog, null, 2));
    
    return res.status(500).json({ 
      error: error.message || 'Internal Server Error',
      details: error.code || 'Unknown' 
    });
  }
}