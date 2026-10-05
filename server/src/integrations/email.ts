import nodemailer from 'nodemailer';
import { env } from '../config/env';
let transport: nodemailer.Transporter | null = null;
export const emailConfigured = () => !!(env.email.host && env.email.user);
/** returns null when email isn't configured (nothing attempted) */
export async function sendEmail(to: string, subject: string, text: string): Promise<boolean | null> {
  if (!emailConfigured()) return null;
  transport ??= nodemailer.createTransport({ host: env.email.host, port: env.email.port, secure: env.email.port === 465, auth: { user: env.email.user, pass: env.email.password } });
  try { await transport.sendMail({ from: env.email.from, to, subject, text }); return true; } catch (e) { console.warn('[email]', (e as Error).message); return false; }
}
