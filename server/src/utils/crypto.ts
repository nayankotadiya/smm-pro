import crypto from 'crypto';
export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
export const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
export const safeEqual = (a: string, b: string) => {
  const ba = Buffer.from(a); const bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
};

/** AES-256-GCM for values staff must be able to re-display (e.g. an active approval link). Key is derived from a server secret. */
const keyOf = (secret: string) => crypto.createHash('sha256').update(`smm-pro:enc:${secret}`).digest();
export function encrypt(plain: string, secret: string) {
  const iv = crypto.randomBytes(12); const c = crypto.createCipheriv('aes-256-gcm', keyOf(secret), iv);
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString('base64url')).join('.');
}
export function decrypt(payload: string, secret: string) {
  const [iv, tag, enc] = payload.split('.').map((x) => Buffer.from(x, 'base64url'));
  const d = crypto.createDecipheriv('aes-256-gcm', keyOf(secret), iv); d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
}
