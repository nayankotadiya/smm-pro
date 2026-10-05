import { ActivityLog, User } from '../models';
import { emitOrg } from './realtime';
interface Input { actorId?: any; actorType?: 'USER' | 'SYSTEM' | 'AUTOMATION' | 'CLIENT' | 'INTEGRATION'; actorName?: string; action: string; message: string; entityType?: string; entityId?: any; contentId?: any; clientId?: any; ip?: string; meta?: any }
export async function logActivity(a: Input) {
  let actorName = a.actorName;
  if (!actorName && a.actorId) actorName = (await User.findById(a.actorId).select('name').lean())?.name;
  const doc = await ActivityLog.create({ ...a, actorName: actorName || (a.actorType === 'AUTOMATION' ? 'Automation' : a.actorType === 'CLIENT' ? 'Client' : 'System'), entityId: a.entityId ? String(a.entityId) : undefined });
  emitOrg('activity:new', doc.toJSON());
  return doc;
}
