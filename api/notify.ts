import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as admin from 'firebase-admin';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  console.log('[API_Notify] Request Received.');

  // Only allow POST requests
  if (req.method !== 'POST') {
    console.warn(`[API_Notify] Invalid Method: ${req.method}`);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { token, title, body, data } = req.body;
    
    // Log the payload structure (careful not to log full token if sensitive, but here useful for debugging)
    console.log('[API_Notify] Payload:', {
        token: token ? `${token.substring(0, 15)}...` : 'MISSING',
        title,
        bodyLen: body ? body.length : 0,
        hasData: !!data
    });

    if (!token || !title || !body) {
      console.error('[API_Notify] Missing Required Fields');
      return res.status(400).json({ error: 'Missing token, title, or body' });
    }

    // 1. Initialize Firebase Admin (Only if not already initialized)
    if (!admin.apps.length) {
      console.log('[API_Notify] Initializing Firebase Admin...');
      const projectId = process.env.FIREBASE_PROJECT_ID;
      const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
      let privateKey = process.env.FIREBASE_PRIVATE_KEY;

      // Log configuration status (DO NOT log the actual key)
      console.log(`[API_Notify] Config - Project: ${projectId}`);
      console.log(`[API_Notify] Config - Email: ${clientEmail}`);
      console.log(`[API_Notify] Config - Key Length: ${privateKey ? privateKey.length : 'MISSING'}`);

      if (!projectId || !clientEmail || !privateKey) {
          throw new Error("Missing Firebase Admin Environment Variables");
      }

      // CRITICAL: Fix Vercel Environment Variable newlines
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
      console.log("[API_Notify] Firebase Admin Initialized Successfully");
    } else {
      console.log("[API_Notify] Firebase Admin already active.");
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

    console.log(`[API_Notify] Sending FCM Message to: ${token.slice(0, 10)}...`);
    const response = await admin.messaging().send(message);
    console.log(`[API_Notify] FCM Send Success. Message ID: ${response}`);
    
    return res.status(200).json({ success: true, messageId: response });
  } catch (error: any) {
    // Robust Error Logging
    console.error('[API_Notify] FATAL ERROR:', error);
    
    const errorLog = {
      message: error.message,
      stack: error.stack,
      code: error.code,
      details: error.errorInfo || error
    };
    
    console.error('[API_Notify] Error Details:', JSON.stringify(errorLog, null, 2));
    
    return res.status(500).json({ 
      error: error.message || 'Internal Server Error',
      details: error.code || 'Unknown' 
    });
  }
}