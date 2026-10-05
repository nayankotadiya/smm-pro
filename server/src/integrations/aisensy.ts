import axios from 'axios';
import { env } from '../config/env';
export const aisensyConfigured = () => !!(env.aisensy.apiKey && env.aisensy.campaignName);

/** Normalise an Indian/intl number to digits with country code (AiSensy expects e.g. 919876543210) */
export function normalisePhone(p: string) {
  let d = (p || '').replace(/\D/g, '');
  if (d.length === 10) d = '91' + d;
  return d;
}

/**
 * Sends an approved WhatsApp template via AiSensy API Campaign.
 * Template params order must match your approved template, e.g.:
 *   Hi {{1}}, "{{2}}" (version {{3}}) is ready for your review: {{4}}
 */
export async function sendTemplate(opts: { phone: string; userName: string; params: string[]; campaignName?: string; buttonUrlSuffix?: string }) {
  if (!aisensyConfigured()) throw new Error('AiSensy is not configured');
  const body: any = {
    apiKey: env.aisensy.apiKey,
    campaignName: opts.campaignName || env.aisensy.campaignName,
    destination: normalisePhone(opts.phone),
    userName: opts.userName || 'Client',
    templateParams: opts.params,
    source: 'smm-pro',
  };
  if (opts.buttonUrlSuffix) body.buttons = [{ type: 'button', sub_type: 'url', index: 0, parameters: [{ type: 'text', text: opts.buttonUrlSuffix }] }];
  const r = await axios.post(env.aisensy.baseUrl, body, { timeout: 15000 });
  const data = r.data || {};
  const messageId = data.submitted_message_id || data.messageId || data.id || data?.data?.id || null;
  return { messageId: messageId ? String(messageId) : null, raw: data };
}
