import { ChatRoom, Message, Content, Client, ChatActionMessage } from '../models';
import { emitToRoom, emitToUsers } from './realtime';
import { managerIds } from './notify';

export async function ensureContentRoom(content: any) {
  let room = await ChatRoom.findOne({ type: 'CONTENT', contentId: content._id });
  const people = [content.assignedWriter, content.assignedShooter, content.assignedEditor, content.assignedSMM, content.assignedReviewer, content.createdBy, ...(await managerIds())].filter(Boolean).map(String);
  if (!room) {
    room = await ChatRoom.create({ type: 'CONTENT', name: `${content.contentId} · ${content.title}`, contentId: content._id, clientId: content.clientId, participants: [...new Set(people)] });
  } else {
    const set = new Set([...room.participants.map(String), ...people]);
    if (set.size !== room.participants.length) { room.participants = [...set] as any; await room.save(); }
  }
  return room;
}
export async function ensureClientRoom(client: any) {
  let room = await ChatRoom.findOne({ type: 'CLIENT', clientId: client._id });
  const people = [...(client.assignedTeam || []), ...(await managerIds())].map(String);
  if (!room) room = await ChatRoom.create({ type: 'CLIENT', name: `${client.name} workspace`, clientId: client._id, participants: [...new Set(people)] });
  return room;
}

export async function broadcastMessage(room: any, msg: any) {
  const populated = await Message.findById(msg._id).populate('senderId', 'name role').populate('attachments').populate({ path: 'replyTo', select: 'message senderId', populate: { path: 'senderId', select: 'name' } }).populate('system.mediaId').lean();
  emitToRoom(`chat:${room._id}`, 'message:new', populated);
  emitToUsers(room.participants, 'chat:room_activity', { roomId: String(room._id), preview: room.lastMessagePreview, at: room.lastMessageAt, senderId: msg.senderId ? String(msg.senderId) : null });
  return populated;
}

/** System event card inside the content chat, e.g. "EDIT V2 UPLOADED" */
export async function postSystemEvent(
  contentId: any,
  event: string,
  title: string,
  lines: string[] = [],
  extra: {
    mediaId?: any;
    link?: string;
    action?: {
      actionType: string;
      title: string;
      description?: string;
      allowedRoles?: string[];
      payload?: any;
    };
  } = {}
) {
  const content = await Content.findById(contentId);
  if (!content) return null;
  const room = await ensureContentRoom(content);
  const msg = await Message.create({ roomId: room._id, kind: 'SYSTEM', system: { event, title, lines, mediaId: extra.mediaId, link: extra.link } });
  room.lastMessageAt = new Date(); room.lastMessagePreview = title; await room.save();

  if (extra.action) {
    try {
      // Auto-supersede previous pending actions of identical or superseded types for this content
      const supersedeTypes: Record<string, string[]> = {
        APPROVE_SCRIPT: ['APPROVE_SCRIPT', 'REQUEST_SCRIPT_CHANGES', 'SUBMIT_FOR_REVIEW'],
        SMM_REVIEW: ['APPROVE_SCRIPT', 'REQUEST_SCRIPT_CHANGES', 'SUBMIT_FOR_REVIEW', 'SMM_REVIEW'],
        SEND_CLIENT_REVIEW: ['APPROVE_SCRIPT', 'REQUEST_SCRIPT_CHANGES', 'SEND_CLIENT_REVIEW'],
        FINAL_REVIEW: ['FINAL_REVIEW', 'UPLOAD_EDIT'],
        ASSIGN_SHOOTER: ['ASSIGN_SHOOTER'],
        CREATE_TASK: ['CREATE_TASK'],
      };
      const toCancel = supersedeTypes[extra.action.actionType] || [extra.action.actionType];
      await ChatActionMessage.updateMany(
        {
          contentId: content._id,
          actionType: { $in: toCancel },
          status: 'PENDING',
        },
        { $set: { status: 'CANCELLED', resultSummary: 'Superseded by newer workflow event' } }
      );

      const actDoc = await ChatActionMessage.create({
        roomId: room._id,
        messageId: msg._id,
        contentId: content._id,
        clientId: content.clientId,
        actionType: extra.action.actionType,
        title: extra.action.title,
        description: extra.action.description,
        allowedRoles: extra.action.allowedRoles,
        payload: extra.action.payload || {},
        status: 'PENDING',
      });
      emitToRoom(`chat:${room._id}`, 'chat:action_new', actDoc.toJSON());
    } catch (e: any) {
      console.warn('[chat:action] create failed', e.message);
    }
  }

  return broadcastMessage(room, msg);
}
export { Client };
