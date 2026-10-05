import { Router } from 'express';
import { ah } from '../utils/async';
import { requirePerm, can } from '../middleware/auth';
import * as d from '../services/dashboard';
import { Content, Presence, User, Media, Message, ChatRoom, Shoot } from '../models';
import { visibilityFilter } from '../services/content';
import { z } from 'zod';

const r = Router();
r.get('/summary', ah(async (req, res) => { res.json({ org: can(req.user, 'dashboard.org') ? await d.summary(req.user!) : null, me: await d.mySummary(req.user!) }); }));
r.get('/content-by-stage', ah(async (req, res) => { res.json(await d.contentByStage(req.user!)); }));
r.get('/recent-content', ah(async (req, res) => { res.json(await d.recentContent(req.user!, Number(req.query.limit) || 10)); }));
r.get('/team-workload', requirePerm('dashboard.org', 'tasks.read.all'), ah(async (_req, res) => { res.json(await d.teamWorkload()); }));
r.get('/pending-approvals', ah(async (req, res) => { res.json(await d.pendingApprovals(req.user!)); }));
r.get('/needs-attention', ah(async (req, res) => { res.json(await d.needsAttention(req.user!)); }));
r.get('/waiting-for', requirePerm('dashboard.org'), ah(async (_req, res) => { res.json(await d.waitingFor()); }));
r.get('/blocked-items', ah(async (req, res) => { res.json(await Content.find({ $and: [visibilityFilter(req.user!), { status: 'BLOCKED' }] }).populate('clientId', 'name').populate('currentOwner', 'name').lean()); }));
r.get('/today-tasks', ah(async (req, res) => { res.json(await d.todayTasks(req.user!, (req.query.scope as any) || 'all')); }));
r.get('/reminders', ah(async (req, res) => { res.json(await d.upcomingReminders(req.user!)); }));
r.get('/pending-reviews-detail', ah(async (req, res) => {
  const { from, to } = req.query as Record<string, string>;
  res.json(await d.pendingReviewsDetail(req.user!, { from, to }));
}));
r.get('/deadline-alerts', ah(async (req, res) => {
  res.json(await d.deadlineAlerts(req.user!));
}));
r.get('/client-report', ah(async (req, res) => {
  const { clientId, period, from, to } = req.query as Record<string, string>;
  res.json(await d.clientReport(req.user!, { clientId, period, from, to }));
}));
r.get('/activity', ah(async (req, res) => {
  // non-managers only see activity on content they can access
  let filter: any = {};
  if (!can(req.user, 'dashboard.org')) { const vis = await Content.find(visibilityFilter(req.user!)).select('_id').lean(); filter = { contentId: { $in: vis.map((v) => v._id) } }; }
  res.json(await d.activity(Number(req.query.limit) || 20, filter));
}));
r.get('/team-presence', ah(async (_req, res) => {
  const users = await User.find({ active: true }).select('name role').lean();
  const pres = await Presence.find({}).lean();
  res.json(users.map((u) => { const p = pres.find((x) => String(x.userId) === String(u._id)); return { userId: u._id, name: u.name, role: u.role, status: p?.status || 'OFFLINE', lastActive: p?.lastActive, lastSeen: p?.lastSeen, currentActivity: p?.status === 'OFFLINE' ? undefined : p?.currentActivity }; }));
}));
r.get('/storage', requirePerm('dashboard.org'), ah(async (_req, res) => { res.json(await d.storage()); }));
r.get('/automation-activity', requirePerm('dashboard.org'), ah(async (_req, res) => { res.json(await d.automationActivity()); }));
r.get('/my-files', ah(async (req, res) => {
  const vis = await Content.find({ $and: [visibilityFilter(req.user!), { status: { $nin: ['COMPLETED', 'CANCELLED'] } }] }).select('_id').lean();
  res.json(await Media.find({ contentId: { $in: vis.map((v) => v._id) }, status: { $nin: ['UPLOADING', 'FAILED', 'SUPERSEDED'] }, uploadedBy: { $ne: req.user!._id } }).sort({ createdAt: -1 }).limit(8).populate('uploadedBy', 'name').populate('contentId', 'contentId title').lean());
}));
r.get('/chat-preview', ah(async (req, res) => {
  const uid = req.user!._id;
  const rooms = await ChatRoom.find({ participants: uid, lastMessageAt: { $ne: null } }).sort({ lastMessageAt: -1 }).limit(5).populate('participants', 'name').lean();
  if (!rooms.length) return res.json([]);
  const mongoose = await import('mongoose');
  const userOid = new mongoose.Types.ObjectId(uid);
  const roomIds = rooms.map((x) => x._id);
  const unreadRows = await Message.aggregate([
    { $match: { roomId: { $in: roomIds }, readBy: { $ne: userOid }, senderId: { $ne: userOid }, deletedAt: null, kind: 'USER' } },
    { $group: { _id: '$roomId', count: { $sum: 1 } } },
  ]);
  const unreadMap = new Map(unreadRows.map((u) => [String(u._id), u.count]));
  res.json(rooms.map((rm) => ({ ...rm, unread: unreadMap.get(String(rm._id)) || 0 })));
}));

// Shooter remark/complaint — shooter can add a remark to a shoot record
r.patch('/shoot-remark/:shootId', ah(async (req, res) => {
  const { remark } = z.object({ remark: z.string().max(2000) }).parse(req.body);
  const shoot = await Shoot.findById(req.params.shootId).lean() as any;
  if (!shoot) return res.status(404).json({ error: 'Shoot not found' });
  await Shoot.findByIdAndUpdate(req.params.shootId, {
    $push: { remarks: { text: remark, by: req.user!._id, byName: req.user!.name, at: new Date() } },
  });
  res.json({ ok: true });
}));

export default r;

