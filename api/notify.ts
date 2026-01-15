import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as admin from 'firebase-admin';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const timestamp = new Date().toISOString();
  console.log(`[API_Notify_XRAY] [${timestamp}] Incoming Request`);

  // 1. Defensive Body Extraction
  let body = req.body;
  
  // Vercel sometimes passes body as a string string if headers aren't perfect
  if (typeof body === 'string') {
    try {
        body = JSON.parse(body);
    } catch (e) {
        console.error('[API_Notify_XRAY] JSON Parse Failed:', e);
        // Continue with empty body to trigger validation error below
        body = {};
    }
  }

  const { token, title, body: msgBody, data } = body || {};

  // 2. Token Validation (Existence Check - Replaces .length check)
  if (!token) {
      console.warn(`[API_Notify_XRAY] Skipped: Missing Token.`);
      return res.status(400).json({ 
          error: "Missing Required Fields", 
          received: Object.keys(body || {}) 
      });
  }

  // 3. Robust Admin Initialization
  // CRITICAL FIX: Use optional chaining to prevent "Cannot read properties of undefined (reading 'length')"
  if (!admin.apps?.length) {
      console.log('[API_Notify_XRAY] Initializing Firebase Admin...');
      
      const projectId = process.env.FIREBASE_PROJECT_ID;
      const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
      const rawKey = process.env.FIREBASE_PRIVATE_KEY;

      if (!rawKey || !projectId || !clientEmail) {
          console.error('[API_Notify_XRAY] Missing Env Vars');
          return res.status(500).json({ error: 'Server Environment Variables Missing' });
      }

      // Exact Key Normalization Logic (Handles Vercel's literal \n string)
      const privateKey = rawKey.replace(/\\n/g, '\n');

      const credentialModule = admin.credential || (admin as any).default?.credential;
      
      if (!credentialModule) {
           console.error('[API_Notify_XRAY] Firebase Admin Credential module missing');
           return res.status(500).json({ error: 'Library Error' });
      }

      try {
          admin.initializeApp({
              credential: credentialModule.cert({
                  projectId,
                  clientEmail,
                  privateKey,
              }),
          });
          console.log('[API_XRAY] Firebase Admin Initialized Successfully');
      } catch (initErr: any) {
          console.error('[API_XRAY] Initialization Failed:', initErr.message);
          return res.status(500).json({ error: 'Initialization Failed', details: initErr.message });
      }
  }

  // 4. Construct Payload
  const safeText = msgBody || 'New Message';
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
      return res.status(500).json({ error: 'FCM Send Failed', details: fcmError.message });
  }
}