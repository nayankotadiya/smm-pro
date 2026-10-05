import { WebhookEvent, Approval, Client, CommunicationLog, Content, WhatsAppNotificationLog } from '../models';
import { sha256 } from '../utils/crypto';
import { logActivity } from './activity';
import { notify, managerIds } from './notify';
import { emitOrg } from './realtime';

/**
 * AiSensy webhook. Payload shapes differ by topic, so we extract defensively.
 * Rule: inbound messages are stored as communication ONLY. They never approve anything automatically.
 */
export async function handleAisensyWebhook(body: any) {
  const data = body?.data ?? body;
  const msg = data?.message ?? data;
  const externalId = String(body?.id || data?.id || msg?.id || msg?.messageId || '') + ':' + String(body?.topic || body?.type || msg?.status || '') || sha256(JSON.stringify(body));
  const key = externalId === ':' ? sha256(JSON.stringify(body)) : externalId;
  try { await WebhookEvent.create({ provider: 'aisensy', externalId: key, eventType: body?.topic || body?.type, payload: body }); }
  catch (e: any) { if (e.code === 11000) return { duplicate: true }; throw e; }

  const topic = String(body?.topic || body?.type || body?.event || '').toLowerCase();
  const status = String(msg?.status || msg?.message_status || data?.status || '').toLowerCase();
  const refId = String(msg?.messageId || msg?.id || msg?.wamid || data?.submitted_message_id || '');
  const direction = String(msg?.direction || msg?.sender || '').toLowerCase();
  const isInbound = topic.includes('message.created') && (direction.includes('inbound') || direction === 'user' || msg?.from) || topic.includes('incoming') || topic.includes('reply');

  if (!isInbound && ['sent', 'delivered', 'read'].includes(status) && refId) {
    const a = await Approval.findOne({ externalMessageId: refId });
    if (a && ['SENT', 'DELIVERED', 'WAITING_FOR_CLIENT'].includes(a.status)) {
      if (status === 'delivered' && !a.deliveredAt) { a.deliveredAt = new Date(); a.status = 'DELIVERED'; a.history.push({ status: 'DELIVERED', at: new Date(), source: 'AISENSY' } as any); }
      if (status === 'read') a.history.push({ status: 'MESSAGE_READ', at: new Date(), source: 'AISENSY', note: 'WhatsApp message read (link not necessarily opened)' } as any);
      await a.save();
      emitOrg('approval:updated', { _id: String(a._id), status: a.status });
    }
    const logUpdate: any = {};
    if (status === 'delivered') { logUpdate.status = 'DELIVERED'; logUpdate.deliveredAt = new Date(); }
    else if (status === 'read') { logUpdate.status = 'READ'; logUpdate.readAt = new Date(); }
    if (Object.keys(logUpdate).length) {
      await WhatsAppNotificationLog.updateOne({ externalMessageId: refId }, { $set: logUpdate });
    }
  }

  if (isInbound) {
    const phone = String(msg?.phone_number || msg?.from || msg?.waId || data?.phone || '').replace(/\D/g, '');
    const text = msg?.message?.text || msg?.text?.body || msg?.text || msg?.button?.text || msg?.interactive?.button_reply?.title || '[non-text message]';
    const last10 = phone.slice(-10);
    const client = last10 ? await Client.findOne({ phone: { $regex: `${last10}$` } }) : null;
    if (client) {
      const openA = await Approval.findOne({ clientId: client._id, status: { $in: ['SENT', 'DELIVERED', 'OPENED', 'WAITING_FOR_CLIENT'] } }).sort({ createdAt: -1 });
      const owner = (await managerIds())[0];
      const log = await CommunicationLog.create({ clientId: client._id, contentId: openA?.contentId, employeeId: owner, type: 'WHATSAPP', direction: 'INBOUND', summary: String(text).slice(0, 2000), source: 'AISENSY', externalId: key, actionRequired: openA ? 'Review client reply — mark approved or create change request' : undefined });
      await logActivity({ actorType: 'INTEGRATION', actorName: 'AiSensy', action: 'aisensy.inbound', message: `WhatsApp reply from ${client.name}`, entityType: 'communication', entityId: log._id, clientId: client._id, contentId: openA?.contentId });
      const content = openA ? await Content.findById(openA.contentId).lean() : null;
      await notify([...(client.assignedTeam || []), ...(await managerIds())], { type: 'whatsapp.inbound', category: 'APPROVAL', title: `WhatsApp from ${client.name}`, message: String(text).slice(0, 140), link: `/clients/${client._id}?tab=communication`, entityType: 'communication', entityId: log._id, contentId: content?._id });
    }
  }
  await WebhookEvent.updateOne({ externalId: key }, { processedAt: new Date() });
  return { ok: true };
}
