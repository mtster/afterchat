import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as admin from 'firebase-admin';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const timestamp = new Date().toISOString();
  console.log(`[API_Notify_XRAY] [${timestamp}] Incoming Request`);

  // --- IMPORT DEBUGGING ---
  // Inspect what Vercel actually gave us in the import
  const adminAny = admin as any;
  console.log('[API_Notify_XRAY] Admin Import Structure:', {
      type: typeof admin,
      hasDefault: !!adminAny.default,
      rootKeys: Object.keys(admin).slice(0, 5), // Log first 5 keys to avoid clutter
      defaultKeys: adminAny.default ? Object.keys(adminAny.default).slice(0, 5) : 'N/A'
  });

  // COMPATIBILITY FIX: Normalize firebase-admin instance
  // In some Vercel/Webpack configs, the library is in .default
  const firebaseAdmin = adminAny.default || admin;

  if (!firebaseAdmin || typeof firebaseAdmin.initializeApp !== 'function') {
      console.error('[API_Notify_XRAY] CRITICAL: firebaseAdmin.initializeApp is not a function');
      console.error('[API_Notify_XRAY] Admin Object:', JSON.stringify(firebaseAdmin, null, 2));
      // Attempt to continue, but likely will fail. This log is vital.
  }

  // 1. Defensive Body Extraction
  let body = req.body;
  
  if (typeof body === 'string') {
    try {
        body = JSON.parse(body);
    } catch (e) {
        console.error('[API_Notify_XRAY] JSON Parse Failed:', e);
        body = {};
    }
  }

  const { token, title, body: msgBody, data } = body || {};

  // 2. Token Validation
  if (!token) {
      console.warn(`[API_Notify_XRAY] Skipped: Missing Token.`);
      return res.status(400).json({ 
          error: "Missing Required Fields", 
          received: Object.keys(body || {}) 
      });
  }

  // 3. Robust Admin Initialization
  // Use the normalized firebaseAdmin object
  if (!firebaseAdmin.apps?.length) {
      console.log('[API_Notify_XRAY] Initializing Firebase Admin...');
      
      const projectId = process.env.FIREBASE_PROJECT_ID;
      const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
      const rawKey = process.env.FIREBASE_PRIVATE_KEY;

      if (!rawKey || !projectId || !clientEmail) {
          console.error('[API_Notify_XRAY] Missing Env Vars');
          return res.status(500).json({ error: 'Server Environment Variables Missing' });
      }

      const privateKey = rawKey.replace(/\\n/g, '\n');

      try {
          firebaseAdmin.initializeApp({
              credential: firebaseAdmin.credential.cert({
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
      const response = await firebaseAdmin.messaging().send(payload);
      console.log(`[API_Notify_XRAY] Success: ${response}`);
      return res.status(200).json({ success: true, messageId: response });
  } catch (fcmError: any) {
      console.error('[API_Notify_XRAY] FCM Send Error Stack:', fcmError.stack);
      return res.status(500).json({ error: 'FCM Send Failed', details: fcmError.message });
  }
}