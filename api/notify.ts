import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as admin from 'firebase-admin';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  console.log(`[API_Notify] Request Method: ${req.method}`);

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { token, title, body, data } = req.body || {};

    // 1. Exact Safety Guard: Check Token Type
    if (!token || typeof token !== 'string') {
        console.warn('[API_Notify] Skipped: Invalid or missing token.');
        return res.status(200).json({ message: 'No valid token provided' });
    }

    // 2. Initialize Admin
    if (!admin.apps.length) {
      console.log('[API_Notify] Initializing Firebase Admin...');
      
      const projectId = process.env.FIREBASE_PROJECT_ID;
      const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
      let privateKey = process.env.FIREBASE_PRIVATE_KEY;

      if (!projectId || !clientEmail || !privateKey) {
          throw new Error("Missing Server Environment Variables");
      }

      // HANDLE QUOTES: If user added quotes in Vercel UI (e.g. "-----BEGIN..."), strip them.
      if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
          console.log('[API_Notify] Detected and removed surrounding quotes from Private Key.');
          privateKey = privateKey.slice(1, -1);
      }

      // HANDLE NEWLINES: Restore newline characters
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
    }

    // 3. Exact Safety Guard: Safe Text
    const safeText = body || 'New Message';
    const safeTitle = title || 'AfterChat';
    
    // 4. Structured Payload
    const payload = {
      token: token,
      notification: {
        title: safeTitle,
        body: safeText.substring(0, 100)
      },
      data: data || { roomId: '' },
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
            contentAvailable: true
          }
        }
      }
    };

    console.log(`[API_Notify] Sending payload to ...${token.slice(-6)}`);

    const response = await admin.messaging().send(payload);
    
    console.log(`[API_Notify] SUCCESS: ${response}`);
    return res.status(200).json({ success: true, messageId: response });

  } catch (error: any) {
    console.error('[API_Notify] ERROR:', error);
    // Return 200 to client to prevent retry loops on 500
    return res.status(200).json({ 
      error: 'Notification Failed', 
      details: error.message || 'Unknown',
      logged: true 
    });
  }
}