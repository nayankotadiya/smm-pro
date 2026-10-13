import webpush from 'web-push';
import { env } from '../config/env';

export function getVapidPublicKey() {
  return env.vapid.publicKey || '';
}

let ready = false;

export function pushConfigured() {
  const pub = env.vapid.publicKey;
  const priv = env.vapid.privateKey;
  if (!pub || !priv) return false;
  if (!ready) {
    try {
      webpush.setVapidDetails(env.vapid.subject || 'mailto:admin@example.com', pub, priv);
      ready = true;
    } catch (e) {
      console.error('[push] Failed to set VAPID details', e);
      return false;
    }
  }
  return true;
}
export async function sendPush(
  sub: any,
  payload: { title: string; body: string; url: string; tag?: string; icon?: string; badge?: string }
): Promise<'SENT' | 'FAILED' | 'GONE' | 'DISABLED'> {
  if (!pushConfigured()) return 'DISABLED';

  const subscription = {
    endpoint: sub.endpoint,
    keys: {
      p256dh: sub.keys?.p256dh,
      auth: sub.keys?.auth,
    },
  };

  const richPayload = {
    title: payload.title || 'Bulletproof Portal',
    body: payload.body || 'New update waiting for your review.',
    url: payload.url || '/',
    tag: payload.tag || ('bp-' + Date.now()),
    icon: payload.icon || '/brand/bulletproof-shield.png',
    badge: payload.badge || '/brand/bulletproof-shield.png',
    timestamp: Date.now(),
    data: {
      url: payload.url || '/',
    },
  };

  // High urgency tells APNs (Apple) & FCM (Android) to deliver immediately even if device is in standby/screen off
  const options: webpush.RequestOptions = {
    TTL: 86400, // 24 hours
    urgency: 'high',
    headers: {
      Urgency: 'high',
    },
  };

  try {
    await webpush.sendNotification(subscription, JSON.stringify(richPayload), options);
    return 'SENT';
  } catch (e: any) {
    if (e.statusCode === 404 || e.statusCode === 410) return 'GONE';
    console.warn('[push] failed statusCode:', e.statusCode, 'body:', e.body);
    return 'FAILED';
  }
}
