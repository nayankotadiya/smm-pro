import { EventEmitter } from 'events';
/** Domain event bus. Workflow emits; automation engine subscribes. */
export type DomainEvent =
  | 'content.created' | 'content.deleted' | 'script.submitted' | 'script.approved' | 'script.changes_requested'
  | 'client_script.approved' | 'client_script.changes_requested'
  | 'raw.uploaded' | 'edit.uploaded' | 'smm.approved' | 'smm.changes_requested'
  | 'final.uploaded' | 'final.approved' | 'final.changes_requested'
  | 'client.approved' | 'client.changes_requested' | 'client_review.sent'
  | 'task.overdue' | 'approval.pending_24h' | 'chat.message' | 'content.scheduled' | 'content.published' | 'content.blocked';
export interface EventPayload { contentId?: string; actorId?: string; [k: string]: any }
export const bus = new EventEmitter();
bus.setMaxListeners(50);
export const emitDomain = (e: DomainEvent, p: EventPayload) => { bus.emit('domain', e, p); };
