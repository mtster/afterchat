import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as admin from 'firebase-admin';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const timestamp = new Date().toISOString();
  console.log(`[API_Notify_XRAY] [${timestamp}] Incoming Request`);

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Log Body Type
    console.log(`[API_Notify_XRAY] req.body type: ${typeof req.body}`);
    const body = req.body || {};
    
    // Extract with checks
    const token = body.token;
    const title = body.title;
    const messageBody = body.body;
    const data = body.data;

    // Check inputs
    if (!token || typeof token !== 'string') {
        console.warn(`[API_Notify_XRAY] Skipped: Invalid Token. Type: ${typeof token}`);
        return res.status(200).json({ status: 'skipped', reason: 'invalid_token' });
    }
    
    console.log(`[API_Notify_XRAY] Target Token: ${token.slice(0, 10)}...`);

    // Initialize Admin
    // Defensive check for admin object
    if (!admin) {
        throw new Error("Firebase Admin module failed to import.");
    }
    
    // Check apps length safely
    const appCount = admin.apps ? admin.apps.length : 0;
    console.log(`[API_Notify_XRAY] Active Firebase Apps: ${appCount}`);

    if (appCount === 0) {
      console.log('[API_Notify_XRAY] Initializing Firebase Admin...');
      
      const projectId = process.env.FIREBASE_PROJECT_ID;
      const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
      let privateKey = process.env.FIREBASE_PRIVATE_KEY;

      console.log(`[API_Notify_XRAY] Env Check - Project: ${!!projectId}, Email: ${!!clientEmail}, Key: ${!!privateKey}`);

      if (!projectId || !clientEmail || !privateKey) {
          throw new Error("Missing Server Environment Variables");
      }

      // Sanitize Key
      if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
          privateKey = privateKey.slice(1, -1);
      }
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
      console.log('[API_Notify_XRAY] Initialization Complete');
    }

    const safeText = messageBody || 'New Message';
    const safeTitle = title || 'AfterChat';
    
    const payload = {
      token: token,
      notification: {
        title: safeTitle,
        body: String(safeText).substring(0, 100) // Ensure string
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

    console.log('[API_Notify_XRAY] Sending to FCM...');
    const response = await admin.messaging().send(payload);
    console.log(`[API_Notify_XRAY] FCM Response: ${response}`);
    
    return res.status(200).json({ success: true, messageId: response });

  } catch (error: any) {
    console.error('[API_Notify_XRAY] FATAL ERROR:', error);
    // Explicitly safe stringify error
    const errorDetails = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;

    return res.status(200).json({ 
      error: 'Notification Failed', 
      details: errorDetails,
      stack: process.env.NODE_ENV === 'development' ? stack : undefined,
      logged: true 
    });
  }
}