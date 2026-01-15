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
    const body = req.body || {};
    const targetToken = body.token;
    const title = body.title;
    const messageBody = body.body;
    const data = body.data;

    // 2. Token Validation
    if (!targetToken || typeof targetToken !== 'string') {
        console.warn(`[API_Notify_XRAY] Skipped: Invalid Token. Type: ${typeof targetToken}`);
        return res.status(200).json({ status: 'skipped', reason: 'invalid_token' });
    }

    console.log('[API_Notify_XRAY] Attempting send to token:', targetToken.substring(0, 10) + '...');

    // 3. Admin Initialization
    if (!admin.apps.length) {
        console.log('[API_Notify_XRAY] Initializing Firebase Admin...');
        
        const projectId = process.env.FIREBASE_PROJECT_ID;
        const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
        let privateKey = process.env.FIREBASE_PRIVATE_KEY;

        if (!privateKey) {
            throw new Error('Private Key is missing from Environment Variables');
        }

        // Sanitize Private Key (remove quotes, fix newlines)
        if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
            privateKey = privateKey.slice(1, -1);
        }
        // Replace literal \n with actual newlines
        privateKey = privateKey.replace(/\\n/g, '\n');

        if (!projectId || !clientEmail) {
            throw new Error('Missing Project ID or Client Email');
        }

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
            throw initErr; // Re-throw to be caught by main catch block
        }
    }

    // 4. Construct Payload
    const safeText = messageBody || 'New Message';
    const safeTitle = title || 'AfterChat';

    const payload = {
      token: targetToken,
      notification: {
        title: safeTitle,
        body: String(safeText).substring(0, 100)
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

    // 5. Send with explicit Try/Catch
    console.log('[API_Notify_XRAY] Sending payload to FCM...');
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
    
    // Return 200 to client to avoid retry loops, but log error details
    return res.status(200).json({ 
      error: 'Notification Failed', 
      details: error.message || 'Unknown Error',
      fullError: JSON.stringify(error, Object.getOwnPropertyNames(error)),
      logged: true 
    });
  }
}