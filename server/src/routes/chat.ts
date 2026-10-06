import { Router } from 'express';
import { z } from 'zod';
import { ChatRoom, Message, User, Content, Media, ChatActionMessage, Approval } from '../models';
import { ah, dupRetry } from '../utils/async';
import { forbidden, notFound, badRequest } from '../utils/errors';
import { can } from '../middleware/auth';
import { broadcastMessage } from '../services/chat';
import { notify } from '../services/notify';
import { createTask } from '../services/tasks';
import { Reminder } from '../models';
import { emitToRoom, emitToUser } from '../services/realtime';
import { emitDomain } from '../services/events';
import { escapeRx } from './clients';
import { reviewInternal, sendClientReview, clientDecision } from '../services/approvals';

const r = Router();
const REACTIONS = ['ack', 'done', 'question', 'important'];
async function room(req: any, id: string) {
  const rm = await ChatRoom.findById(id);
  if (!rm) throw notFound('Chat');
  if (!rm.participants.map(String).includes(req.user._id)) throw forbidden('You are not a member of this chat');
  return rm;
}

r.get('/rooms', ah(async (req, res) => {
  const uid = req.user!._id;
  const rooms = await ChatRoom.find({ participants: uid }).sort({ lastMessageAt: -1, createdAt: -1 }).populate('participants', 'name role').populate('contentId', 'contentId title').populate('clientId', 'name').lean();
  const unread = await Message.aggregate([{ $match: { roomId: { $in: rooms.map((x) => x._id) }, readBy: { $ne: new (require('mongoose').Types.ObjectId)(uid) }, senderId: { $ne: new (require('mongoose').Types.ObjectId)(uid) }, deletedAt: null, kind: 'USER' } }, { $group: { _id: '$roomId', n: { $sum: 1 } } }]);
  res.json(rooms.map((x) => ({ ...x, unread: unread.find((u) => String(u._id) === String(x._id))?.n || 0 })));
}));
r.post('/rooms', ah(async (req, res) => {
  const b = z.object({ type: z.enum(['DIRECT', 'TEAM']), userId: z.string().optional(), name: z.string().max(80).optional(), participants: z.array(z.string()).max(100).optional() }).parse(req.body);
  const uid = req.user!._id;
  if (b.type === 'DIRECT') {
    if (!b.userId || b.userId === uid) throw badRequest('Choose a team member');
    if (!(await User.exists({ _id: b.userId, active: true }))) throw notFound('User');
    const key = [uid, b.userId].sort().join(':');
    const rm = await dupRetry(() => ChatRoom.findOneAndUpdate({ directKey: key }, { $setOnInsert: { type: 'DIRECT', directKey: key, participants: [uid, b.userId], createdBy: uid } }, { upsert: true, new: true }));
    return res.json(rm);
  }
  if (!can(req.user, 'tasks.manage')) throw forbidden('Only leads and managers can create team chats');
  if (!b.name) throw badRequest('Name the team chat');
  const rm = await ChatRoom.create({ type: 'TEAM', name: b.name, participants: [...new Set([uid, ...(b.participants || [])])], createdBy: uid });
  rm.participants.forEach((p) => emitToUser(p, 'chat:room_activity', { roomId: String(rm._id) }));
  res.status(201).json(rm);
}));
r.get('/unread-count', ah(async (req, res) => {
  const rooms = await ChatRoom.find({ participants: req.user!._id }).select('_id').lean();
  res.json({ count: await Message.countDocuments({ roomId: { $in: rooms.map((x) => x._id) }, readBy: { $ne: req.user!._id }, senderId: { $ne: req.user!._id }, deletedAt: null, kind: 'USER' }) });
}));

r.get('/:roomId/messages', ah(async (req, res) => {
  const rm = await room(req, req.params.roomId);
  const q: any = { roomId: rm._id, deletedAt: null };
  if (req.query.before) q.createdAt = { $lt: new Date(String(req.query.before)) };
  if (req.query.q) q.message = new RegExp(escapeRx(String(req.query.q)), 'i');
  const msgs = await Message.find(q).sort({ createdAt: -1 }).limit(Math.min(100, Number(req.query.limit) || 50))
    .populate('senderId', 'name role').populate('attachments').populate('system.mediaId').populate({ path: 'replyTo', select: 'message senderId kind system.title', populate: { path: 'senderId', select: 'name' } }).lean();
  const pinned = await Message.find({ _id: { $in: rm.pinned || [] } }).populate('senderId', 'name').lean();
  const unreadUpdated = await Message.updateMany(
    { roomId: rm._id, senderId: { $ne: req.user!._id }, readBy: { $ne: req.user!._id } },
    { $addToSet: { readBy: req.user!._id, deliveredTo: req.user!._id } }
  );
  if (unreadUpdated.modifiedCount > 0) {
    emitToRoom(`chat:${rm._id}`, 'message:read', { roomId: String(rm._id), userId: req.user!._id });
    for (const p of rm.participants) {
      emitToUser(p, 'message:read', { roomId: String(rm._id), userId: req.user!._id });
    }
    emitToUser(req.user!._id, 'chat:unread_changed', { roomId: String(rm._id) });
  }
  res.json({ room: await ChatRoom.findById(rm._id).populate('participants', 'name role').populate('contentId', 'contentId title').populate('clientId', 'name').lean(), messages: msgs.reverse(), pinned });
}));

r.post('/:roomId/messages', ah(async (req, res) => {
  const rm = await room(req, req.params.roomId);
  const b = z.object({ message: z.string().max(5000).optional(), attachments: z.array(z.string()).max(10).optional(), replyTo: z.string().optional().nullable(), clientNonce: z.string().max(60).optional() }).parse(req.body);
  if (!b.message?.trim() && !b.attachments?.length) throw badRequest('Message is empty');
  if (b.attachments?.length) { const n = await Media.countDocuments({ _id: { $in: b.attachments }, uploadedBy: req.user!._id, status: { $nin: ['UPLOADING', 'FAILED'] } }); if (n !== b.attachments.length) throw badRequest('Attachment is not ready'); }
  const members = await User.find({ _id: { $in: rm.participants } }).select('name').lean();
  const text = b.message?.trim() || '';
  const mentions = members.filter((m) => new RegExp(`@${escapeRx(m.name.split(' ')[0])}\\b`, 'i').test(text)).map((m) => m._id);
  const msg = await Message.create({ roomId: rm._id, senderId: req.user!._id, message: text, attachments: b.attachments, replyTo: b.replyTo || undefined, mentions, readBy: [req.user!._id], deliveredTo: [req.user!._id] });
  rm.lastMessageAt = new Date(); rm.lastMessagePreview = `${req.user!.name.split(' ')[0]}: ${text || 'Attachment'}`.slice(0, 120); await rm.save();
  const out: any = await broadcastMessage(rm, msg);
  // Automation: new chat message -> notification (mentions and DMs always; group rooms follow CHAT preference)
  const title = rm.type === 'DIRECT' ? `Message from ${req.user!.name}` : `${req.user!.name} in ${rm.name}`;
  await notify(rm.participants, { type: mentions.length ? 'chat.mention' : 'chat.message', category: 'CHAT', title, message: (text || 'Sent an attachment').slice(0, 140), link: `/chat/${rm._id}`, entityType: 'chatRoom', entityId: rm._id, contentId: rm.contentId }, { excludeUserId: req.user!._id });
  emitDomain('chat.message', { roomId: String(rm._id), actorId: req.user!._id, contentId: rm.contentId ? String(rm.contentId) : undefined });
  res.status(201).json({ ...out, clientNonce: b.clientNonce });
}));

r.post('/message/:messageId/reaction', ah(async (req, res) => {
  const b = z.object({ key: z.enum(REACTIONS as [string, ...string[]]) }).parse(req.body);
  const m = await Message.findById(req.params.messageId);
  if (!m) throw notFound('Message');
  await room(req, String(m.roomId));
  const i = m.reactions.findIndex((x: any) => String(x.userId) === req.user!._id && x.key === b.key);
  if (i >= 0) m.reactions.splice(i, 1); else m.reactions.push({ userId: req.user!._id, key: b.key } as any);
  await m.save();
  emitToRoom(`chat:${m.roomId}`, 'message:reaction', { messageId: String(m._id), roomId: String(m.roomId), reactions: m.reactions });
  res.json(m.reactions);
}));
r.post('/message/:messageId/pin', ah(async (req, res) => {
  const m = await Message.findById(req.params.messageId);
  if (!m) throw notFound('Message');
  const rm = await room(req, String(m.roomId));
  const has = rm.pinned.map(String).includes(String(m._id));
  await ChatRoom.updateOne({ _id: rm._id }, has ? { $pull: { pinned: m._id } } : { $addToSet: { pinned: m._id } });
  emitToRoom(`chat:${rm._id}`, 'message:pinned', { roomId: String(rm._id), messageId: String(m._id), pinned: !has });
  res.json({ pinned: !has });
}));
r.delete('/message/:messageId', ah(async (req, res) => {
  const m = await Message.findById(req.params.messageId);
  if (!m) throw notFound('Message');
  if (String(m.senderId) !== req.user!._id && !can(req.user, 'users.manage')) throw forbidden();
  m.deletedAt = new Date(); await m.save();
  emitToRoom(`chat:${m.roomId}`, 'message:deleted', { roomId: String(m.roomId), messageId: String(m._id) });
  res.json({ ok: true });
}));

/** Chat -> Task */
r.post('/message/:messageId/task', ah(async (req, res) => {
  const b = z.object({ title: z.string().max(200).optional(), assignedTo: z.string().optional().nullable(), dueAt: z.coerce.date().optional().nullable(), priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional() }).parse(req.body || {});
  const m = await Message.findById(req.params.messageId);
  if (!m) throw notFound('Message');
  const rm = await room(req, String(m.roomId));
  const content = rm.contentId ? await Content.findById(rm.contentId) : null;
  // default assignee: whoever currently owns the content, else the editor, else the requester
  const assignee = b.assignedTo || content?.assignedEditor || content?.currentOwner || req.user!._id;
  const t = await createTask({ title: (b.title || m.message || 'Follow up from chat').slice(0, 200), description: `From chat: "${(m.message || '').slice(0, 500)}"`, contentId: rm.contentId, clientId: rm.clientId || content?.clientId, assignedTo: assignee, dueAt: b.dueAt || undefined, priority: b.priority || 'MEDIUM', sourceMessageId: m._id, kind: 'CHAT' }, { actorId: req.user!._id, source: 'CHAT' });
  res.status(201).json(t);
}));
/** Chat -> Reminder */
r.post('/message/:messageId/reminder', ah(async (req, res) => {
  const b = z.object({ remindAt: z.coerce.date(), title: z.string().max(200).optional() }).parse(req.body);
  const m = await Message.findById(req.params.messageId);
  if (!m) throw notFound('Message');
  const rm = await room(req, String(m.roomId));
  const rem = await Reminder.create({ title: (b.title || m.message || 'Chat reminder').slice(0, 200), description: `From chat: "${(m.message || '').slice(0, 300)}"`, type: rm.contentId ? 'CONTENT' : 'PERSONAL', userId: req.user!._id, createdBy: req.user!._id, contentId: rm.contentId, clientId: rm.clientId, messageId: m._id, remindAt: b.remindAt, source: 'CHAT' });
  emitToUser(req.user!._id, 'reminder:new', rem.toJSON());
  res.status(201).json(rem);
}));

/** Persistent Chat Actions for this room */
r.get('/:roomId/actions', ah(async (req, res) => {
  const rm = await room(req, req.params.roomId);
  const q: any = { roomId: rm._id };
  if (req.query.status) q.status = req.query.status;
  const actions = await ChatActionMessage.find(q)
    .sort({ createdAt: -1 })
    .limit(50)
    .populate('executedBy', 'name role')
    .lean();
  res.json(actions);
}));

/** Execute a persistent chat action */
r.post('/action/:actionId/execute', ah(async (req, res) => {
  const act = await ChatActionMessage.findById(req.params.actionId);
  if (!act) throw notFound('Action');
  await room(req, String(act.roomId));

  if (act.status !== 'PENDING') throw badRequest('This action has already been executed or cancelled');
  if (act.allowedRoles?.length && !act.allowedRoles.includes(req.user!.role) && !['SUPER_ADMIN', 'ADMIN', 'MANAGER'].includes(req.user!.role)) {
    throw forbidden('You do not have permission to execute this action');
  }

  const b = req.body || {};
  let summary = '';

  if (act.actionType === 'APPROVE_SCRIPT' || act.actionType === 'REQUEST_SCRIPT_CHANGES' || act.actionType === 'SMM_REVIEW' || act.actionType === 'FINAL_REVIEW') {
    const decision = b.decision || (act.actionType === 'REQUEST_SCRIPT_CHANGES' ? 'CHANGES' : 'APPROVE');
    const note = b.note || act.description;
    const approvalId = act.payload?.approvalId || (await Approval.findOne({ contentId: act.contentId, status: 'PENDING' }))?._id;
    if (!approvalId) throw badRequest('No pending review found for this item');
    await reviewInternal(String(approvalId), decision, note, req.user!, b.comments || []);
    summary = `${req.user!.name} ${decision === 'APPROVE' ? 'approved' : 'requested changes on'} ${act.payload?.version || 'version'}`;
  } else if (act.actionType === 'SEND_CLIENT_REVIEW') {
    const kind = act.payload?.kind || 'FINAL';
    const result = await sendClientReview(req.user!, { contentId: String(act.contentId), kind });
    summary = `${req.user!.name} sent ${kind} to client for review: ${result.url}`;
  } else if (act.actionType === 'MARK_APPROVED' || act.actionType === 'CREATE_CHANGE_REQUEST') {
    const approvalId = act.payload?.approvalId || (await Approval.findOne({ contentId: act.contentId, status: { $in: ['DRAFT', 'SENT', 'DELIVERED', 'OPENED', 'WAITING_FOR_CLIENT'] } }))?._id;
    if (!approvalId) throw badRequest('No active client review found for this content');
    const decision = act.actionType === 'MARK_APPROVED' ? 'APPROVE' : 'CHANGES';
    const comments = b.comment ? [{ comment: b.comment }] : (b.comments || [{ comment: act.description || 'Changes requested from communication' }]);
    await clientDecision(approvalId, decision, { comments }, { manualBy: req.user! });
    summary = `${req.user!.name} marked client approval as ${decision}`;
  } else if (act.actionType === 'ASSIGN_SHOOTER') {
    const shooterId = b.shooterId || act.payload?.shooterId;
    if (!shooterId) throw badRequest('Select a shooter');
    await Content.updateOne({ _id: act.contentId }, { assignedShooter: shooterId });
    summary = `${req.user!.name} assigned shooter to content`;
  } else if (act.actionType === 'CREATE_TASK') {
    const t = await createTask({
      title: b.title || act.title,
      description: b.description || act.description,
      contentId: act.contentId,
      clientId: act.clientId,
      assignedTo: b.assignedTo || req.user!._id,
      dueAt: b.dueAt,
      priority: b.priority || 'MEDIUM',
      sourceMessageId: act.messageId,
      kind: 'CHAT',
    }, { actorId: req.user!._id, source: 'CHAT' });
    summary = `Task created: ${t.title}`;
  } else if (act.actionType === 'CREATE_REMINDER') {
    const rem = await Reminder.create({
      title: b.title || act.title,
      description: b.description || act.description,
      type: act.contentId ? 'CONTENT' : 'PERSONAL',
      userId: req.user!._id,
      createdBy: req.user!._id,
      contentId: act.contentId,
      clientId: act.clientId,
      messageId: act.messageId,
      remindAt: b.remindAt || new Date(Date.now() + 3600e3),
      source: 'CHAT',
    });
    emitToUser(req.user!._id, 'reminder:new', rem.toJSON());
    summary = `Reminder set: ${rem.title}`;
  } else {
    summary = `Action ${act.actionType} executed by ${req.user!.name}`;
  }

  act.status = 'EXECUTED';
  act.executedBy = req.user!._id as any;
  act.executedAt = new Date();
  act.resultSummary = summary;
  await act.save();

  emitToRoom(`chat:${act.roomId}`, 'chat:action_executed', act.toJSON());
  res.json(act);
}));

/** Dismiss a single chat action */
r.post('/action/:actionId/dismiss', ah(async (req, res) => {
  const act = await ChatActionMessage.findById(req.params.actionId);
  if (!act) throw notFound('Action');
  await room(req, String(act.roomId));
  act.status = 'CANCELLED';
  act.executedBy = req.user!._id as any;
  act.executedAt = new Date();
  act.resultSummary = `Dismissed by ${req.user!.name}`;
  await act.save();
  emitToRoom(`chat:${act.roomId}`, 'chat:action_executed', act.toJSON());
  res.json(act);
}));

/** Clear all pending actions for this room */
r.post('/:roomId/actions/clear-all', ah(async (req, res) => {
  const rm = await room(req, req.params.roomId);
  await ChatActionMessage.updateMany(
    { roomId: rm._id, status: 'PENDING' },
    { $set: { status: 'CANCELLED', executedBy: req.user!._id, executedAt: new Date(), resultSummary: `Cleared by ${req.user!.name}` } }
  );
  emitToRoom(`chat:${rm._id}`, 'chat:action_executed', { roomId: rm._id });
  res.json({ ok: true });
}));

export default r;
