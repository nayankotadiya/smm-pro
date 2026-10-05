import webpush from 'web-push';
import { env } from '../config/env';
let ready = false;
export function pushConfigured() {
  if (!env.vapid.publicKey || !env.vapid.privateKey) return false;
  if (!ready) { webpush.setVapidDetails(env.vapid.subject, env.vapid.publicKey, env.vapid.privateKey); ready = true; }
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
