import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as admin from 'firebase-admin';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  console.log(`[API_Notify] Request Method: ${req.method}`);

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { token, title, body, data } = req.body || {};

    // 1. Strict Token Check
    if (!token || typeof token !== 'string') {
        console.warn('[API_Notify] Skipped: No valid token provided.');
        return res.status(200).json({ message: 'No token provided, notification skipped.' });
    }

    // 2. Initialize Admin (Classic Pattern)
    if (!admin.apps.length) {
      console.log('[API_Notify] Initializing Firebase Admin...');
      
      const projectId = process.env.FIREBASE_PROJECT_ID;
      const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
      let privateKey = process.env.FIREBASE_PRIVATE_KEY;

      if (!projectId || !clientEmail || !privateKey) {
          throw new Error("Missing Server Environment Variables");
      }

      // Handle Vercel newlines
      if (privateKey.includes("\\n")) {
          privateKey = privateKey.replace(/\\n/g, '\n');
      }

      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      });
      console.log("[API_Notify] Admin Initialized.");
    }

    const finalBody = `🚀 ${body || 'New Message'}`;
    
    const message = {
      token: token,
      notification: {
        title: title || 'New Message',
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

    console.log(`[API_Notify] Sending to ...${token.slice(-6)}`);

    // 3. Send Message
    const response = await admin.messaging().send(message);
    
    console.log(`[API_Notify] SUCCESS: ${response}`);
    return res.status(200).json({ success: true, messageId: response });

  } catch (error: any) {
    console.error('[API_Notify] FATAL ERROR:', error);
    // Return 200 even on error to prevent Client-side loops, but log the error
    return res.status(200).json({ 
      error: 'Notification Failed', 
      details: error.message || 'Unknown Error',
      logged: true 
    });
  }
}