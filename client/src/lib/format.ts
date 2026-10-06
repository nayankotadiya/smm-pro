export const STAGES = ['IDEA', 'SCRIPT', 'INTERNAL_REVIEW', 'CLIENT_REVIEW', 'SHOOTING', 'RAW_FOOTAGE', 'EDITING', 'SMM_REVIEW', 'FINAL_REVIEW', 'CLIENT_FINAL_APPROVAL', 'SCHEDULE', 'PUBLISHED'];
const LABELS: Record<string, string> = {
  IDEA: 'Idea', SCRIPT: 'Script', INTERNAL_REVIEW: 'Internal Review', CLIENT_REVIEW: 'Client Review', SHOOTING: 'Shooting', RAW_FOOTAGE: 'Raw Footage', EDITING: 'Editing',
  SMM_REVIEW: 'SMM Review', FINAL_REVIEW: 'Final Review', CLIENT_FINAL_APPROVAL: 'Client Final Approval', SCHEDULE: 'Schedule', PUBLISHED: 'Published',
  WAITING_FOR_CLIENT: 'Waiting for Client', CHANGES_REQUESTED: 'Changes Requested', TODO: 'To Do', IN_PROGRESS: 'In Progress', DND: 'Do Not Disturb',
  INTERNAL_SCRIPT: 'Script Review', CLIENT_SCRIPT: 'Client Script Review', SMM: 'SMM Review', FINAL: 'Final Review', CLIENT_FINAL: 'Client Final Approval',
  SUPER_ADMIN: 'Super Admin', TEAM_LEAD: 'Team Lead', SCRIPT_WRITER: 'Script Writer', INSTAGRAM_DM: 'Instagram DM', WHATSAPP: 'WhatsApp', CLIENT_FOLLOWUP: 'Client Follow-up',
  REVIEW_REQUIRED: 'Review Required', RAW_UPLOADED: 'Raw Uploaded', MESSAGE_READ: 'Message read', SUBMITTED: 'Submitted', AISENSY: 'AiSensy', LINK: 'Link', SMM_ROLE: 'SMM',
};
export const label = (s?: string | null) => (s ? LABELS[s] || s.replace(/_/g, ' ').toLowerCase().replace(/(^|\s)\S/g, (m) => m.toUpperCase()) : '—');
export const roleLabel = (s?: string) => (s === 'SMM' ? 'SMM' : label(s));

type Tone = 'neutral' | 'blue' | 'green' | 'amber' | 'red';
export function tone(status?: string): Tone {
  switch (status) {
    case 'APPROVED': case 'COMPLETED': case 'PUBLISHED': case 'SUCCESS': case 'ONLINE': case 'CONNECTED': case 'READY': return 'green';
    case 'CHANGES_REQUESTED': case 'OVERDUE': case 'BLOCKED': case 'FAILED': case 'EXPIRED': case 'URGENT': case 'ERROR': return 'red';
    case 'WAITING_FOR_CLIENT': case 'PENDING': case 'REVIEW': case 'REVIEW_REQUIRED': case 'AWAY': case 'HIGH': case 'OPENED': case 'IN_REVIEW': case 'ONBOARDING': case 'PAUSED': return 'amber';
    case 'IN_PROGRESS': case 'ACTIVE': case 'SENT': case 'DELIVERED': case 'SCHEDULED': case 'SUBMITTED': return 'blue';
    default: return 'neutral';
  }
}
const d = (x: any) => (x instanceof Date ? x : new Date(x));
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
export function fmtTime(x?: any) { return x ? d(x).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''; }
export function fmtDate(x?: any) { if (!x) return '—'; const v = d(x); return v.toLocaleDateString([], { day: 'numeric', month: 'short', ...(v.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) }); }
export function fmtDateTime(x?: any) {
  if (!x) return '—'; const v = d(x); const now = new Date();
  const tm = new Date(now); tm.setDate(now.getDate() + 1); const y = new Date(now); y.setDate(now.getDate() - 1);
  const day = sameDay(v, now) ? 'Today' : sameDay(v, tm) ? 'Tomorrow' : sameDay(v, y) ? 'Yesterday' : fmtDate(v);
  return `${day}, ${fmtTime(v)}`;
}
export function ago(x?: any) {
  if (!x) return ''; const s = Math.max(0, (Date.now() - +d(x)) / 1000);
  if (s < 45) return 'just now'; if (s < 3600) return `${Math.round(s / 60)} min ago`; if (s < 86400) return `${Math.round(s / 3600)} h ago`; if (s < 7 * 86400) return `${Math.round(s / 86400)} d ago`;
  return fmtDate(x);
}
export function formatLastSeen(x?: any) {
  if (!x) return 'offline';
  const sec = Math.max(0, (Date.now() - +d(x)) / 1000);
  if (sec < 60) return 'last seen just now';
  if (sec < 3600) return `last seen ${Math.round(sec / 60)} min ago`;
  const v = d(x);
  const now = new Date();
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (sameDay(v, now)) return `last seen today at ${fmtTime(v)}`;
  if (sameDay(v, y)) return `last seen yesterday at ${fmtTime(v)}`;
  return `last seen ${fmtDate(v)}`;
}
export function fmtAge(hours?: number | null) { if (hours == null) return '—'; if (hours < 1) return '<1 h'; return hours < 48 ? `${hours} h` : `${Math.round(hours / 24)} d`; }
export function fmtSize(b?: number) { if (!b) return '—'; if (b >= 1e9) return `${(b / 1e9).toFixed(2)} GB`; if (b >= 1e6) return `${(b / 1e6).toFixed(b >= 1e7 ? 0 : 1)} MB`; return `${Math.max(1, Math.round(b / 1e3))} KB`; }
export function fmtTs(s?: number | null) { if (s == null) return ''; return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`; }
export const isOverdue = (x?: any, done?: boolean) => !!x && !done && +d(x) < Date.now();
export const toLocalInput = (x?: any) => { if (!x) return ''; const v = d(x); const p = (n: number) => String(n).padStart(2, '0'); return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}T${p(v.getHours())}:${p(v.getMinutes())}`; };
export const initials = (n?: string) => (n || '?').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
export const stageNumber = (s: string) => STAGES.indexOf(s) + 1;
