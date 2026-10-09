import { Content, Client, Task, Approval, Media, ActivityLog, Reminder, User, Presence, AutomationRun, Automation, ScheduledPost, Shoot } from '../models';
import { AuthUser, can } from '../middleware/auth';
import { visibilityFilter } from './content';
import { STAGES } from '../config/constants';

const DAY = 864e5;
const startOfDay = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const OPEN_CLIENT = ['SENT', 'DELIVERED', 'OPENED', 'WAITING_FOR_CLIENT'];

export async function summary(u: AuthUser) {
  const vis = visibilityFilter(u);
  const c = (q: any) => Content.countDocuments({ $and: [vis, q] });
  const [totalClients, totalContent, pendingScripts, shooting, editing, clientReviews, needsReview, scheduled, published, overdueTasks, blocked] = await Promise.all([
    Client.countDocuments({}), c({ status: { $ne: 'CANCELLED' } }), c({ stage: { $in: ['IDEA', 'SCRIPT', 'INTERNAL_REVIEW'] } }), c({ stage: 'SHOOTING' }), c({ stage: { $in: ['RAW_FOOTAGE', 'EDITING'] } }),
    Approval.countDocuments({ type: { $in: ['CLIENT_SCRIPT', 'CLIENT_FINAL'] }, status: { $in: OPEN_CLIENT } }),
    Approval.countDocuments({ type: { $in: ['INTERNAL_SCRIPT', 'SMM', 'FINAL'] }, status: 'PENDING' }),
    c({ stage: 'SCHEDULE' }), c({ stage: 'PUBLISHED' }),
    Task.countDocuments({ ...(can(u, 'tasks.read.all') ? {} : { assignedTo: u._id }), status: { $ne: 'COMPLETED' }, dueAt: { $lt: new Date() } }),
    c({ status: 'BLOCKED' }),
  ]);
  return { totalClients, totalContent, pendingScripts, shooting, editing, clientReviews, needsReview, scheduled, published, overdue: overdueTasks, blocked };
}

export async function mySummary(u: AuthUser) {
  const now = new Date(); const eod = new Date(startOfDay().getTime() + DAY);
  const mine = { assignedTo: u._id };
  const [assigned, dueToday, inProgress, completed, overdue, waitingForMe, pendingReviews] = await Promise.all([
    Task.countDocuments({ ...mine, status: { $ne: 'COMPLETED' } }),
    Task.countDocuments({ ...mine, status: { $ne: 'COMPLETED' }, dueAt: { $gte: startOfDay(), $lt: eod } }),
    Task.countDocuments({ ...mine, status: 'IN_PROGRESS' }),
    Task.countDocuments({ ...mine, status: 'COMPLETED', completedAt: { $gte: new Date(Date.now() - 7 * DAY) } }),
    Task.countDocuments({ ...mine, status: { $ne: 'COMPLETED' }, dueAt: { $lt: now } }),
    Content.countDocuments({ currentOwner: u._id, status: { $nin: ['COMPLETED', 'CANCELLED'] } }),
    Approval.countDocuments({ reviewerId: u._id, status: 'PENDING' }),
  ]);
  return { assigned, dueToday, inProgress, completed, overdue, waitingForMe, pendingReviews };
}

export async function contentByStage(u: AuthUser) {
  const r = await Content.aggregate([{ $match: { deletedAt: null, status: { $ne: 'CANCELLED' }, ...toMatch(visibilityFilter(u)) } }, { $group: { _id: '$stage', count: { $sum: 1 } } }]);
  return STAGES.map((s) => ({ stage: s, count: r.find((x) => x._id === s)?.count || 0 }));
}
function toMatch(f: any) { // convert string ids to ObjectIds for aggregate
  const mongoose = require('mongoose');
  if (!f.$or) return f;
  return { $or: f.$or.map((o: any) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, new mongoose.Types.ObjectId(String(v))]))) };
}

export async function recentContent(u: AuthUser, limit = 10) {
  return Content.find(visibilityFilter(u)).sort({ updatedAt: -1 }).limit(limit).populate('clientId', 'name').populate('currentOwner', 'name role').lean();
}

export async function teamWorkload() {
  const users = await User.find({ active: true, role: { $nin: ['SUPER_ADMIN'] } }).select('name role avatarUrl').lean();
  // three simple group-bys (kept free of $cond so it also runs on MongoDB-compatible stores)
  const g = (match: any) => Task.aggregate([{ $match: { deletedAt: null, assignedTo: { $ne: null }, ...match } }, { $group: { _id: '$assignedTo', n: { $sum: 1 } } }]);
  const [all, done, late] = await Promise.all([g({}), g({ status: 'COMPLETED' }), g({ status: { $ne: 'COMPLETED' }, dueAt: { $lt: new Date() } })]);
  const pick = (rows: any[], id: any) => rows.find((x) => String(x._id) === String(id))?.n || 0;
  const agg = users.map((usr) => ({ _id: usr._id, assigned: pick(all, usr._id), completed: pick(done, usr._id), overdue: pick(late, usr._id) }));
  const pres = await Presence.find({}).lean();
  return users.map((usr) => {
    const a = agg.find((x) => String(x._id) === String(usr._id)) || { assigned: 0, completed: 0, overdue: 0 };
    const pending = a.assigned - a.completed;
    const p = pres.find((x) => String(x.userId) === String(usr._id));
    return { userId: usr._id, name: usr.name, role: usr.role, avatarUrl: (usr as any).avatarUrl || null, assigned: a.assigned, completed: a.completed, pending, overdue: a.overdue, workload: Math.min(100, Math.round((pending / 8) * 100)), presence: p?.status || 'OFFLINE', lastActive: p?.lastActive, currentActivity: p?.currentActivity };
  });
}

export async function pendingApprovals(u: AuthUser) {
  const q: any = { status: { $in: ['PENDING', ...OPEN_CLIENT] } };
  if (!can(u, 'approvals.review') && !can(u, 'content.read.all')) q.reviewerId = u._id;
  return Approval.find(q).sort({ createdAt: -1 }).limit(20).populate({ path: 'contentId', select: 'contentId title stage', populate: { path: 'clientId', select: 'name' } }).populate('reviewerId', 'name').lean();
}

export async function needsAttention(u: AuthUser) {
  const now = Date.now();
  const rows: any[] = [];
  const add = (issue: string, severity: number, c: any, owner: any, since: Date | undefined, link: string) => rows.push({ issue, severity, content: c ? { _id: c._id, contentId: c.contentId, title: c.title } : null, client: c?.clientId?.name, owner: owner?.name, ageHours: since ? Math.round((now - new Date(since).getTime()) / 36e5) : null, link });
  const overdue = await Task.find({ status: { $ne: 'COMPLETED' }, dueAt: { $lt: new Date() } }).populate({ path: 'contentId', select: 'contentId title clientId', populate: { path: 'clientId', select: 'name' } }).populate('assignedTo', 'name').limit(15).lean();
  overdue.forEach((t: any) => add(`Overdue task: ${t.title}`, 3, t.contentId, t.assignedTo, t.dueAt, `/tasks/${t._id}`));
  const slow = await Approval.find({ type: { $in: ['CLIENT_SCRIPT', 'CLIENT_FINAL'] }, status: { $in: OPEN_CLIENT }, sentAt: { $lt: new Date(now - DAY) } }).populate({ path: 'contentId', select: 'contentId title clientId', populate: { path: 'clientId', select: 'name' } }).populate('reviewerId', 'name').lean();
  slow.forEach((a: any) => add(`Client review pending >24h (${a.version})`, 3, a.contentId, a.reviewerId, a.sentAt, `/approvals?tab=client`));
  const blocked = await Content.find({ status: 'BLOCKED' }).populate('clientId', 'name').populate('currentOwner', 'name').lean();
  blocked.forEach((c: any) => add(`Blocked: ${c.blocked?.reason || ''}`, 3, c, c.currentOwner, c.blocked?.since, `/content/${c._id}`));
  const smm = await Approval.find({ type: 'SMM', status: 'PENDING' }).populate({ path: 'contentId', select: 'contentId title clientId', populate: { path: 'clientId', select: 'name' } }).populate('reviewerId', 'name').lean();
  smm.forEach((a: any) => add(`Waiting for SMM review (${a.version})`, 2, a.contentId, a.reviewerId, a.sentAt, `/content/${a.contentId?._id}?tab=reviews`));
  const failedPosts = await ScheduledPost.find({ status: 'FAILED' }).populate({ path: 'contentId', select: 'contentId title clientId', populate: { path: 'clientId', select: 'name' } }).lean();
  failedPosts.forEach((p: any) => add('Failed scheduled post', 3, p.contentId, null, p.updatedAt, `/content/${p.contentId?._id}?tab=schedule`));
  const unassigned = await Task.find({ status: { $ne: 'COMPLETED' }, assignedTo: null }).populate({ path: 'contentId', select: 'contentId title clientId', populate: { path: 'clientId', select: 'name' } }).limit(10).lean();
  unassigned.forEach((t: any) => add(`Unassigned task: ${t.title}`, 2, t.contentId, null, t.createdAt, `/tasks/${t._id}`));
  const failedAuto = await Automation.find({ lastResult: 'FAILED', active: true }).lean();
  failedAuto.forEach((a: any) => add(`Automation failed: ${a.name}`, 2, null, null, a.lastRunAt, '/automation'));
  const failedUploads = await Media.find({ status: 'FAILED', updatedAt: { $gt: new Date(now - 3 * DAY) } }).populate({ path: 'contentId', select: 'contentId title clientId', populate: { path: 'clientId', select: 'name' } }).populate('uploadedBy', 'name').limit(10).lean();
  failedUploads.forEach((m: any) => add(`Failed upload: ${m.fileName}`, 1, m.contentId, m.uploadedBy, m.updatedAt, `/media`));
  if (!can(u, 'dashboard.org')) return rows.filter((r) => r.owner === u.name).sort((a, b) => b.severity - a.severity || (b.ageHours || 0) - (a.ageHours || 0));
  return rows.sort((a, b) => b.severity - a.severity || (b.ageHours || 0) - (a.ageHours || 0));
}

export async function waitingFor() {
  const c = (q: any) => Content.countDocuments({ status: { $nin: ['COMPLETED', 'CANCELLED'] }, ...q });
  return {
    clientReviews: await Approval.countDocuments({ type: { $in: ['CLIENT_SCRIPT', 'CLIENT_FINAL'] }, status: { $in: OPEN_CLIENT } }),
    internalReviews: await Approval.countDocuments({ type: 'INTERNAL_SCRIPT', status: 'PENDING' }),
    rawFootage: await c({ stage: 'SHOOTING' }),
    editorAction: await c({ stage: { $in: ['RAW_FOOTAGE', 'EDITING'] } }),
    smmAction: await c({ stage: 'SMM_REVIEW' }),
    finalReview: await c({ stage: 'FINAL_REVIEW' }),
    scheduling: await c({ stage: 'SCHEDULE' }),
  };
}

export async function todayTasks(u: AuthUser, scope: 'all' | 'mine' | 'overdue' | 'open') {
  const eod = new Date(startOfDay().getTime() + DAY);
  const q: any = { status: { $ne: 'COMPLETED' } };
  if (scope === 'overdue') q.dueAt = { $lt: new Date() }; else if (scope !== 'open') q.dueAt = { $lt: eod };
  if (scope === 'mine' || scope === 'open' || !can(u, 'tasks.read.all')) q.assignedTo = u._id;
  return Task.find(q).sort({ dueAt: 1 }).limit(30).populate('clientId', 'name').populate('contentId', 'contentId title').populate('assignedTo', 'name').lean();
}

export async function storage() {
  const agg = await Media.aggregate([{ $match: { deletedAt: null, status: { $nin: ['FAILED', 'UPLOADING'] } } }, { $group: { _id: '$category', bytes: { $sum: '$size' }, count: { $sum: 1 } } }]);
  let quota: any = null;
  try { const { driveConfigured, storageQuota } = await import('../integrations/drive'); if (driveConfigured()) quota = await storageQuota(); } catch (e: any) { quota = { error: 'Could not read Drive quota' }; }
  return { byCategory: agg, quota };
}

export async function automationActivity(limit = 15) {
  return AutomationRun.find({}).sort({ createdAt: -1 }).limit(limit).lean();
}
export async function activity(limit = 20, filter: any = {}) {
  return ActivityLog.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
}
export async function upcomingReminders(u: AuthUser) {
  return Reminder.find({ userId: u._id, completed: false, remindAt: { $lt: new Date(Date.now() + 3 * DAY) } }).sort({ remindAt: 1 }).limit(10).lean();
}

export async function pendingReviewsDetail(u: AuthUser, opts: { from?: string; to?: string } = {}) {
  const dateFilter: any = {};
  if (opts.from) dateFilter.$gte = new Date(opts.from);
  if (opts.to) { const to = new Date(opts.to); to.setHours(23, 59, 59, 999); dateFilter.$lte = to; }
  const hasDate = Object.keys(dateFilter).length > 0;

  // Pending script reviews (INTERNAL_SCRIPT approval type = PENDING)
  const scriptQ: any = { type: 'INTERNAL_SCRIPT', status: 'PENDING' };
  if (hasDate) scriptQ.createdAt = dateFilter;
  if (!can(u, 'approvals.review') && !can(u, 'content.read.all')) scriptQ.reviewerId = u._id;

  const scriptReviews = await Approval.find(scriptQ)
    .sort({ createdAt: -1 })
    .limit(50)
    .populate({ path: 'contentId', select: 'contentId title stage clientId', populate: { path: 'clientId', select: 'name' } })
    .populate('reviewerId', 'name role')
    .populate('createdBy', 'name')
    .lean();

  // Pending video reviews (SMM + FINAL approval types = PENDING)
  const videoQ: any = { type: { $in: ['SMM', 'FINAL'] }, status: 'PENDING' };
  if (hasDate) videoQ.createdAt = dateFilter;
  if (!can(u, 'approvals.review') && !can(u, 'content.read.all')) videoQ.reviewerId = u._id;

  const videoReviews = await Approval.find(videoQ)
    .sort({ createdAt: -1 })
    .limit(50)
    .populate({ path: 'contentId', select: 'contentId title stage clientId', populate: { path: 'clientId', select: 'name' } })
    .populate({ path: 'mediaId', select: 'fileName mimeType versionNumber' })
    .populate('reviewerId', 'name role')
    .populate('createdBy', 'name')
    .lean();

  // Client reviews pending > threshold
  const clientQ: any = { type: { $in: ['CLIENT_SCRIPT', 'CLIENT_FINAL'] }, status: { $in: OPEN_CLIENT } };
  if (hasDate) clientQ.createdAt = dateFilter;

  const clientReviews = await Approval.find(clientQ)
    .sort({ sentAt: -1 })
    .limit(50)
    .populate({ path: 'contentId', select: 'contentId title stage clientId', populate: { path: 'clientId', select: 'name' } })
    .populate('reviewerId', 'name role')
    .lean();

  return { scriptReviews, videoReviews, clientReviews };
}

export async function deadlineAlerts(u: AuthUser) {
  const now = Date.now();
  const vis = visibilityFilter(u);
  const visIds = (await Content.find(vis).select('_id').lean()).map((c) => c._id);

  // 1. Upcoming or overdue shoots (within next 48h or past 24h not completed)
  const shootRange = { $gte: new Date(now - 24 * 3600e3), $lte: new Date(now + 48 * 3600e3) };
  const shoots = await Shoot.find({ contentId: { $in: visIds }, shootDate: shootRange, status: { $ne: 'COMPLETED' } })
    .populate({ path: 'contentId', select: 'contentId title stage clientId', populate: { path: 'clientId', select: 'name' } })
    .populate('shooterId', 'name role')
    .sort({ shootDate: 1 })
    .limit(20)
    .lean();

  const formattedShoots = shoots.map((s: any) => {
    const shootTime = s.shootDate ? new Date(s.shootDate).getTime() : now;
    const hoursRemaining = Math.round((shootTime - now) / 36e5);
    return {
      _id: s._id,
      contentId: s.contentId?._id,
      code: s.contentId?.contentId,
      title: s.contentId?.title,
      clientName: s.contentId?.clientId?.name || 'Client',
      shooterName: s.shooterId?.name || 'Unassigned',
      shootDate: s.shootDate,
      shootTime: s.shootTime,
      location: s.location,
      status: s.status,
      hoursRemaining,
      isOverdue: hoursRemaining < 0,
      remarksCount: s.remarks?.length || 0,
    };
  });

  // 2. Overdue or upcoming content deadlines (due within 36 hours or already past)
  const deadlineRange = { $lte: new Date(now + 36 * 3600e3) };
  const contents = await Content.find({
    _id: { $in: visIds },
    deadline: deadlineRange,
    status: { $nin: ['COMPLETED', 'CANCELLED'] },
    stage: { $ne: 'PUBLISHED' },
  })
    .populate('clientId', 'name')
    .populate('currentOwner', 'name role')
    .sort({ deadline: 1 })
    .limit(20)
    .lean();

  const formattedDeadlines = contents.map((c: any) => {
    const dlTime = new Date(c.deadline).getTime();
    const hoursRemaining = Math.round((dlTime - now) / 36e5);
    return {
      _id: c._id,
      code: c.contentId,
      title: c.title,
      stage: c.stage,
      clientName: c.clientId?.name || 'Client',
      ownerName: c.currentOwner?.name || 'Unassigned',
      deadline: c.deadline,
      hoursRemaining,
      isOverdue: hoursRemaining < 0,
    };
  });

  // 3. Stalled client reviews (>24h waiting for client decision)
  const stalledApprovals = await Approval.find({
    contentId: { $in: visIds },
    type: { $in: ['CLIENT_SCRIPT', 'CLIENT_FINAL'] },
    status: { $in: OPEN_CLIENT },
    createdAt: { $lte: new Date(now - 24 * 3600e3) },
  })
    .populate({ path: 'contentId', select: 'contentId title stage clientId', populate: { path: 'clientId', select: 'name phone' } })
    .populate('reviewerId', 'name')
    .sort({ sentAt: 1 })
    .limit(20)
    .lean();

  const formattedStalled = stalledApprovals.map((a: any) => {
    const sentTime = (a.sentAt || a.createdAt) ? new Date(a.sentAt || a.createdAt).getTime() : now;
    const hoursWaiting = Math.round((now - sentTime) / 36e5);
    return {
      _id: a._id,
      contentId: a.contentId?._id,
      code: a.contentId?.contentId,
      title: a.contentId?.title,
      type: a.type,
      version: a.version,
      clientName: a.contentId?.clientId?.name || 'Client',
      recipientPhone: a.recipientPhone || a.contentId?.clientId?.phone,
      recipientName: a.recipientName,
      status: a.status,
      hoursWaiting,
      sentAt: a.sentAt || a.createdAt,
    };
  });

  return {
    shoots: formattedShoots,
    deadlines: formattedDeadlines,
    stalledApprovals: formattedStalled,
    totalCount: formattedShoots.length + formattedDeadlines.length + formattedStalled.length,
  };
}

export async function clientReport(u: AuthUser, query: { clientId?: string; period?: string; from?: string; to?: string }) {
  const now = new Date();
  let startDate = new Date(now.getTime() - 7 * DAY);
  let endDate = new Date(now.getTime() + DAY);

  if (query.from) startDate = new Date(query.from);
  if (query.to) { endDate = new Date(query.to); endDate.setHours(23, 59, 59, 999); }
  else if (query.period === 'today') {
    startDate = startOfDay();
    endDate = new Date(startDate.getTime() + DAY);
  } else if (query.period === 'week') {
    startDate = new Date(now.getTime() - 7 * DAY);
  } else if (query.period === 'month') {
    startDate = new Date(now.getTime() - 30 * DAY);
  }

  const clientMatch: any = {};
  if (query.clientId) clientMatch.clientId = query.clientId;

  const vis = visibilityFilter(u);
  const items = await Content.find({
    $and: [vis, clientMatch, { status: { $ne: 'CANCELLED' } }],
  })
    .populate('clientId', 'name businessName')
    .populate('currentOwner', 'name role')
    .sort({ updatedAt: -1 })
    .limit(100)
    .lean();

  const contentIds = items.map((i) => i._id);
  const shoots = await Shoot.find({ contentId: { $in: contentIds } }).populate('shooterId', 'name').lean();
  const approvals = await Approval.find({ contentId: { $in: contentIds }, status: { $in: OPEN_CLIENT } }).lean();

  const shootMap = new Map();
  shoots.forEach((s) => shootMap.set(String(s.contentId), s));

  const approvalMap = new Map();
  approvals.forEach((a) => approvalMap.set(String(a.contentId), a));

  let inScript = 0;
  let inShoot = 0;
  let inEdit = 0;
  let pendingClient = 0;
  let scheduled = 0;
  let published = 0;

  const enrichedItems = items.map((c: any) => {
    const s = shootMap.get(String(c._id));
    const a = approvalMap.get(String(c._id));
    if (['IDEA', 'SCRIPT', 'INTERNAL_REVIEW'].includes(c.stage)) inScript++;
    else if (c.stage === 'SHOOTING') inShoot++;
    else if (['RAW_FOOTAGE', 'EDITING', 'SMM_REVIEW', 'FINAL_REVIEW'].includes(c.stage)) inEdit++;
    else if (c.stage === 'SCHEDULE') scheduled++;
    else if (c.stage === 'PUBLISHED') published++;

    if (a) pendingClient++;

    return {
      _id: c._id,
      code: c.contentId,
      title: c.title,
      stage: c.stage,
      status: c.status,
      deadline: c.deadline,
      clientName: c.clientId?.name || 'General',
      owner: c.currentOwner?.name || 'Unassigned',
      shoot: s ? {
        shootDate: s.shootDate,
        shootTime: s.shootTime,
        location: s.location,
        shooterName: s.shooterId?.name || 'Bhargav',
        remarks: s.remarks || [],
      } : null,
      pendingApproval: a ? {
        type: a.type,
        version: a.version,
        sentAt: a.sentAt,
      } : null,
    };
  });

  const selectedClient = query.clientId && items.length > 0 ? (items[0] as any).clientId?.name : 'All Clients';

  // Build formatted WhatsApp update text
  const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const waLines = [
    `📊 *SMM PRO — PRODUCTION & PROGRESS REPORT*`,
    `📅 *Date:* ${dateStr}`,
    `🏢 *Client:* ${selectedClient}`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `📌 *OVERVIEW SUMMARY*`,
    `• Total Content: ${items.length}`,
    `• In Scripting: ${inScript} 📝`,
    `• In Shooting: ${inShoot} 🎥`,
    `• In Video Editing: ${inEdit} ✂️`,
    `• Scheduled: ${scheduled} 🗓️`,
    `• Published: ${published} 🚀`,
    `• Pending Client Review: ${pendingClient} ⏳`,
    ``,
  ];

  if (pendingClient > 0) {
    waLines.push(`⏳ *PENDING CLIENT APPROVALS*`);
    enrichedItems.filter((i) => i.pendingApproval).forEach((i, idx) => {
      waLines.push(`${idx + 1}. *[${i.code}]* ${i.title}`);
      waLines.push(`   └ Status: Waiting for Client (${i.pendingApproval!.version || 'Review'})`);
    });
    waLines.push(``);
  }

  const upcomingShoots = enrichedItems.filter((i) => i.shoot && i.shoot.shootDate);
  if (upcomingShoots.length > 0) {
    waLines.push(`🎥 *SCHEDULED SHOOTS*`);
    upcomingShoots.slice(0, 5).forEach((i, idx) => {
      const d = new Date(i.shoot!.shootDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      waLines.push(`${idx + 1}. *[${i.code}]* ${i.title}`);
      waLines.push(`   └ Date: ${d} ${i.shoot!.shootTime ? '@ ' + i.shoot!.shootTime : ''} | Shooter: ${i.shoot!.shooterName}`);
      if (i.shoot!.location) waLines.push(`   └ Loc: ${i.shoot!.location}`);
      if (i.shoot!.remarks?.length) {
        const lastRemark = i.shoot!.remarks[i.shoot!.remarks.length - 1];
        waLines.push(`   └ Note: "${lastRemark.text}" (${lastRemark.byName || 'Shooter'})`);
      }
    });
    waLines.push(``);
  }

  waLines.push(`━━━━━━━━━━━━━━━━━━━━`);
  waLines.push(`_Report generated via SMM PRO Management System_`);

  return {
    client: selectedClient,
    period: query.period || 'custom',
    dateRange: { from: startDate.toISOString(), to: endDate.toISOString() },
    stats: {
      total: items.length,
      inScript,
      inShoot,
      inEdit,
      pendingClient,
      scheduled,
      published,
    },
    items: enrichedItems,
    whatsappText: waLines.join('\n'),
  };
}
