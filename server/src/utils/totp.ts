import crypto from 'crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

export function base32Decode(input: string): Buffer {
  const cleanInput = input.toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (let i = 0; i < cleanInput.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(cleanInput[i]);
    if (idx === -1) continue;

    value = (value << 5) | idx;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

export function generateTotpSecret(): string {
  // 20 bytes = 160 bits (RFC recommended key length)
  const buf = crypto.randomBytes(20);
  return base32Encode(buf);
}

export function generateOtpAuthUri(issuer: string, accountName: string, secret: string): string {
  const encIssuer = encodeURIComponent(issuer);
  const encAccount = encodeURIComponent(accountName);
  return `otpauth://totp/${encIssuer}:${encAccount}?secret=${secret}&issuer=${encIssuer}&algorithm=SHA1&digits=6&period=30`;
}

export function calculateTotpCode(secret: string, timeSec = Math.floor(Date.now() / 1000)): string {
  const key = base32Decode(secret);
  const counter = Math.floor(timeSec / 30);
  const buf = Buffer.alloc(8);
  buf.writeBigInt64BE(BigInt(counter), 0);

  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = (
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff)
  ) % 1_000_000;

  return code.toString().padStart(6, '0');
}

export function verifyTotpCode(secret: string, token: string, window = 1): boolean {
  if (!token || token.length !== 6 || !/^\d{6}$/.test(token)) return false;
  const currentSec = Math.floor(Date.now() / 1000);

  for (let errorWindow = -window; errorWindow <= window; errorWindow++) {
    const testSec = currentSec + errorWindow * 30;
    const expected = calculateTotpCode(secret, testSec);
    if (crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected))) {
      return true;
    }
  }
  return false;
}

export function generateBackupCodes(count = 8): { raw: string[]; hashed: string[] } {
  const raw: string[] = [];
  const hashed: string[] = [];

  for (let i = 0; i < count; i++) {
    const code = crypto.randomBytes(5).toString('hex'); // 10 chars
    raw.push(code);
    hashed.push(crypto.createHash('sha256').update(code).digest('hex'));
  }

  return { raw, hashed };
}
