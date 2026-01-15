import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as admin from 'firebase-admin';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const timestamp = new Date().toISOString();
  console.log(`[API_Notify_XRAY] [${timestamp}] Incoming Request`);

  // 1. Environment Variable X-Ray
  console.log('[API_XRAY] Checking Env Vars:', { 
    project: !!process.env.FIREBASE_PROJECT_ID, 
    email: !!process.env.FIREBASE_CLIENT_EMAIL, 
    key: !!process.env.FIREBASE_PRIVATE_KEY 
  });

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { token, title, body: messageBody, data } = req.body || {};

    // 2. Token Validation
    if (!token || typeof token !== 'string') {
        console.warn(`[API_Notify_XRAY] Skipped: Invalid Token. Type: ${typeof token}`);
        return res.status(200).json({ status: 'skipped', reason: 'invalid_token' });
    }

    // 3. Robust Admin Initialization
    if (!admin.apps.length) {
        console.log('[API_Notify_XRAY] Initializing Firebase Admin...');
        
        const projectId = process.env.FIREBASE_PROJECT_ID;
        const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
        const rawKey = process.env.FIREBASE_PRIVATE_KEY;

        if (!rawKey || !projectId || !clientEmail) {
            throw new Error('Missing Server Environment Variables');
        }

        // Exact Key Normalization Logic
        const formattedKey = rawKey.replace(/\\n/g, '\n');

        // Robust Credential Access (Fix for "reading cert of undefined")
        const credentialModule = admin.credential || (admin as any).default?.credential;
        
        if (!credentialModule) {
            throw new Error('Firebase Admin Credential module not found (Import Error)');
        }

        try {
            admin.initializeApp({
                credential: credentialModule.cert({
                    projectId,
                    clientEmail,
                    privateKey: formattedKey,
                }),
            });
            console.log('[API_XRAY] Firebase Admin Initialized Successfully');
        } catch (initErr: any) {
            console.error('[API_XRAY] Initialization Failed:', initErr.message);
            throw initErr;
        }
    }

    // 4. Send Payload
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

    console.log('[API_Notify_XRAY] Validated token. Sending to FCM...');

    try {
        const response = await admin.messaging().send(payload);
        console.log(`[API_Notify_XRAY] Success: ${response}`);
        return res.status(200).json({ success: true, messageId: response });
    } catch (fcmError: any) {
        console.error('[API_Notify_XRAY] FCM Send Error Stack:', fcmError.stack);
        throw fcmError;
    }

  } catch (error: any) {
    console.error('[API_Notify_XRAY] FATAL ERROR:', error.message);
    console.error('[API_Notify_XRAY] Error Stack:', error.stack);
    
    return res.status(200).json({ 
      error: 'Notification Failed', 
      details: error.message || 'Unknown Error',
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      logged: true 
    });
  }
}