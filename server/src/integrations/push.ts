import webpush from 'web-push';
import { env } from '../config/env';
const FALLBACK_PUBLIC = 'BM4oiMoCIfSAONuA_s5AEEKP4vvxl7dr0YMDPHV9arv8YNZ2S0mYm81ib04YYgH2J1vI4DvlQUQYDYqWAurIetk';
const FALLBACK_PRIVATE = '2GonNNyeE68ox1xr3AIxSnyzQ3fDWriSS2VioLGBvZE';

export function getVapidPublicKey() {
  return env.vapid.publicKey || FALLBACK_PUBLIC;
}

let ready = false;

export function pushConfigured() {
  const pub = env.vapid.publicKey || FALLBACK_PUBLIC;
  const priv = env.vapid.privateKey || FALLBACK_PRIVATE;
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
export async function sendPush(sub: any, payload: { title: string; body: string; url: string; tag?: string }): Promise<'SENT' | 'FAILED' | 'GONE' | 'DISABLED'> {
  if (!pushConfigured()) return 'DISABLED';
  try {
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, JSON.stringify(payload), { TTL: 3600 });
    return 'SENT';
  } catch (e: any) {
    if (e.statusCode === 404 || e.statusCode === 410) return 'GONE';
    console.warn('[push] failed', e.statusCode, e.body);
    return 'FAILED';
  }
}
