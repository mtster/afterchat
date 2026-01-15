import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  console.log(`[API_Notify] Request Method: ${req.method}`);

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 1. Log Environment Variable Status (Masked)
    const hasProject = !!process.env.FIREBASE_PROJECT_ID;
    const hasEmail = !!process.env.FIREBASE_CLIENT_EMAIL;
    const hasKey = !!process.env.FIREBASE_PRIVATE_KEY;
    
    console.log(`[API_Notify] Env Config -> Project: ${hasProject}, Email: ${hasEmail}, Key: ${hasKey}`);
    
    if (!hasProject || !hasEmail || !hasKey) {
        throw new Error("Missing Server-Side Environment Variables");
    }

    // 2. Parse and Validate Body
    const body = req.body || {};
    const { token, title, body: msgBody, data } = body;
    
    console.log('[API_Notify] Payload Type Checks:', {
        tokenType: typeof token,
        titleType: typeof title,
        bodyType: typeof msgBody,
        dataType: typeof data
    });

    if (typeof token !== 'string' || !token) {
        console.error('[API_Notify] Error: Token is missing or not a string.');
        return res.status(400).json({ error: 'Invalid Token' });
    }
    
    if (typeof title !== 'string' || !title) {
        console.error('[API_Notify] Error: Title is missing.');
        return res.status(400).json({ error: 'Invalid Title' });
    }

    // 3. Initialize Firebase Admin (Modular Style)
    if (getApps().length === 0) {
      console.log('[API_Notify] Initializing Firebase Admin (Modular)...');
      
      let privateKey = process.env.FIREBASE_PRIVATE_KEY || "";
      // Handle Vercel newlines
      if (privateKey.includes("\\n")) {
          privateKey = privateKey.replace(/\\n/g, '\n');
      }

      initializeApp({
        credential: cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: privateKey,
        }),
      });
      console.log("[API_Notify] Firebase Admin Initialized.");
    } else {
      console.log("[API_Notify] Firebase Admin already initialized.");
    }

    // 4. Construct Message
    const finalBody = `🚀 ${msgBody || 'New Message'}`;
    
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

    console.log(`[API_Notify] Sending to FCM (Token ending in ...${token.slice(-6)})`);

    // 5. Send via Messaging Module
    const messageId = await getMessaging().send(message);
    
    console.log(`[API_Notify] SUCCESS. Message ID: ${messageId}`);
    return res.status(200).json({ success: true, messageId });

  } catch (error: any) {
    console.error('[API_Notify] FATAL EXCEPTION:', error);
    
    // Detailed error breakdown
    const errDetails = {
        message: error.message || 'Unknown Message',
        code: error.code || 'No Code',
        stack: error.stack || 'No Stack'
    };
    
    console.error('[API_Notify] Debug Dump:', JSON.stringify(errDetails));

    return res.status(500).json({ 
      error: error.message || 'Internal Server Error',
      details: error.code || 'Unknown' 
    });
  }
}