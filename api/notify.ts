import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as admin from 'firebase-admin';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const timestamp = new Date().toISOString();
  console.log(`[API_Notify_XRAY] [${timestamp}] Incoming Request`);

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 1. Safe Body Extraction
    const { token, title, body: messageBody, data } = req.body || {};

    // 2. Token Validation (Existence Check)
    if (!token || typeof token !== 'string') {
        console.warn(`[API_Notify_XRAY] Skipped: Invalid Token. Type: ${typeof token}`);
        return res.status(200).json({ status: 'skipped', reason: 'invalid_token' });
    }

    // 3. Admin Initialization (Defensive Coding)
    // Check if admin.apps exists before checking length
    if (!admin.apps?.length) {
        console.log('[API_Notify_XRAY] Initializing Firebase Admin...');
        
        const projectId = process.env.FIREBASE_PROJECT_ID;
        const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
        let privateKey = process.env.FIREBASE_PRIVATE_KEY;

        if (!privateKey || !projectId || !clientEmail) {
            throw new Error('Missing Server Environment Variables (Project ID, Email, or Key)');
        }

        // Sanitize Private Key
        if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
            privateKey = privateKey.slice(1, -1);
        }
        privateKey = privateKey.replace(/\\n/g, '\n');

        try {
            admin.initializeApp({
                credential: admin.credential.cert({
                    projectId,
                    clientEmail,
                    privateKey,
                }),
            });
            console.log('[API_Notify_XRAY] Admin Initialized successfully.');
        } catch (initErr: any) {
            console.error('[API_Notify_XRAY] Init Failed:', initErr);
            throw initErr;
        }
    }

    // 4. Construct Payload
    const safeText = messageBody || 'New Message';
    const safeTitle = title || 'AfterChat';

    const payload = {
      token: token,
      notification: {
        title: safeTitle,
        body: String(safeText).substring(0, 100)
      },
      data: data || { roomId: '' }
    };

    console.log('[API_Notify_XRAY] Validated token and payload successfully');
    console.log('[API_Notify_XRAY] Sending payload to FCM...');

    // 5. Send
    try {
        const response = await admin.messaging().send(payload);
        console.log(`[API_Notify_XRAY] Success: ${response}`);
        return res.status(200).json({ success: true, messageId: response });
    } catch (fcmError: any) {
        console.error('[API_Notify_XRAY] FCM Send Error:', JSON.stringify(fcmError, Object.getOwnPropertyNames(fcmError)));
        throw fcmError;
    }

  } catch (error: any) {
    console.error('[API_Notify_XRAY] FATAL ERROR:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
    return res.status(200).json({ 
      error: 'Notification Failed', 
      details: error.message || 'Unknown Error',
      logged: true 
    });
  }
}