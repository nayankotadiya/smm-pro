export const STAGES = [
  'IDEA', 'SCRIPT', 'INTERNAL_REVIEW', 'CLIENT_REVIEW', 'VOICE_OVER',
  'SHOOTING', 'RAW_FOOTAGE', 'AI_GENERATION', 'GRAPHIC_DESIGN', 'EDITING',
  'SMM_REVIEW', 'FINAL_REVIEW', 'CLIENT_FINAL_APPROVAL', 'FINAL_UPLOAD', 'SCHEDULE', 'PUBLISHED'
];

export const STATUS_CONFIG: Record<string, { label: string; color: string; textColor: string; isLight?: boolean }> = {
  // Google Sheets Reference Colors
  SCRIPT_DONE: { label: 'Script Done', color: '#00D9E8', textColor: '#003a40', isLight: true },
  VOICE_OVER: { label: 'Voice Over', color: '#9575CD', textColor: '#ffffff' },
  SHOOT: { label: 'Shoot', color: '#FF9800', textColor: '#ffffff' },
  EDIT_DONE: { label: 'Edit Done', color: '#FFEB00', textColor: '#3b2502', isLight: true },
  SCHEDULING: { label: 'Scheduling', color: '#E600E6', textColor: '#ffffff' },
  UPLOAD_DONE: { label: 'Upload Done', color: '#00E600', textColor: '#052e16', isLight: true },
  SHOOT_CANCELLED: { label: 'Shoot Cancelled', color: '#FF0000', textColor: '#ffffff' },
  CLIENT_REVIEW: { label: 'Client Review', color: '#C98555', textColor: '#ffffff' },
  TRAIL: { label: 'Trail', color: '#B39DDB', textColor: '#1e1b4b', isLight: true },

  // Operational Statuses
  NOT_STARTED: { label: 'Not Started', color: '#94A3B8', textColor: '#0f172a', isLight: true },
  IN_PROGRESS: { label: 'In Progress', color: '#38BDF8', textColor: '#082f49', isLight: true },
  NEEDS_REVIEW: { label: 'Needs Review', color: '#FBBF24', textColor: '#451a03', isLight: true },
  CHANGES_REQUIRED: { label: 'Changes Required', color: '#F87171', textColor: '#ffffff' },
  APPROVED: { label: 'Approved', color: '#10B981', textColor: '#ffffff' },
  PENDING_CLIENT_APPROVAL: { label: 'Pending Client Approval', color: '#F59E0B', textColor: '#ffffff' },
  SCHEDULED: { label: 'Scheduled', color: '#C084FC', textColor: '#3b0764', isLight: true },
  POSTED: { label: 'Posted', color: '#059669', textColor: '#ffffff' },
  OVERDUE: { label: 'Overdue', color: '#EF4444', textColor: '#ffffff' },
  CANCELLED: { label: 'Cancelled', color: '#64748B', textColor: '#ffffff' },
  NOT_REQUIRED: { label: 'Not Required', color: '#CBD5E1', textColor: '#334155', isLight: true },
  BLOCKED: { label: 'Blocked', color: '#DC2626', textColor: '#ffffff' },
};

export function getStatusMeta(statusCode?: string | null) {
  if (!statusCode) return { label: 'Not Started', color: '#94A3B8', textColor: '#0f172a', isLight: true };
  const key = statusCode.toUpperCase().replace(/\s+/g, '_');
  if (STATUS_CONFIG[key]) return STATUS_CONFIG[key];
  // Fallbacks for stage codes
  if (key === 'SHOOTING') return STATUS_CONFIG.SHOOT;
  if (key === 'EDITING') return STATUS_CONFIG.EDIT_DONE;
  if (key === 'SCHEDULE') return STATUS_CONFIG.SCHEDULING;
  if (key === 'FINAL_UPLOAD' || key === 'RAW_FOOTAGE') return STATUS_CONFIG.UPLOAD_DONE;
  if (key.includes('REVIEW')) return STATUS_CONFIG.CLIENT_REVIEW;
  return { label: label(statusCode), color: '#64748B', textColor: '#ffffff' };
}

const LABELS: Record<string, string> = {
  IDEA: 'Idea', SCRIPT: 'Script', INTERNAL_REVIEW: 'Internal Review', CLIENT_REVIEW: 'Client Review',
  VOICE_OVER: 'Voice Over', SHOOTING: 'Shooting', RAW_FOOTAGE: 'Raw Footage', AI_GENERATION: 'AI Generation',
  GRAPHIC_DESIGN: 'Graphic Design', EDITING: 'Editing', SMM_REVIEW: 'SMM Review', FINAL_REVIEW: 'Final Review',
  CLIENT_FINAL_APPROVAL: 'Client Final Approval', FINAL_UPLOAD: 'Final Upload', SCHEDULE: 'Schedule', PUBLISHED: 'Published',
  WAITING_FOR_CLIENT: 'Waiting for Client', CHANGES_REQUESTED: 'Changes Requested', TODO: 'To Do', IN_PROGRESS: 'In Progress', DND: 'Do Not Disturb',
  INTERNAL_SCRIPT: 'Script Review', CLIENT_SCRIPT: 'Client Script Review', SMM: 'SMM Review', FINAL: 'Final Review', CLIENT_FINAL: 'Client Final Approval',
  SUPER_ADMIN: 'Super Admin', TEAM_LEAD: 'Team Lead', SCRIPT_WRITER: 'Script Writer', GRAPHIC_DESIGNER: 'Graphic Designer',
  INSTAGRAM_DM: 'Instagram DM', WHATSAPP: 'WhatsApp', CLIENT_FOLLOWUP: 'Client Follow-up',
  REVIEW_REQUIRED: 'Review Required', RAW_UPLOADED: 'Raw Uploaded', MESSAGE_READ: 'Message read', SUBMITTED: 'Submitted', AISENSY: 'AiSensy', LINK: 'Link', SMM_ROLE: 'SMM',
  REEL: 'Reel', POST: 'Post', CAROUSEL: 'Carousel', AI_REEL: 'AI Reel', AI_IMAGE: 'AI Image', STORY: 'Story', AD: 'Ad Creative', OTHER: 'Other',
};
export const label = (s?: string | null) => (s ? LABELS[s] || s.replace(/_/g, ' ').toLowerCase().replace(/(^|\s)\S/g, (m) => m.toUpperCase()) : '—');
export const roleLabel = (s?: string) => (s === 'SMM' ? 'SMM' : label(s));

type Tone = 'neutral' | 'blue' | 'green' | 'amber' | 'red';
export function tone(status?: string): Tone {
  switch (status) {
    case 'APPROVED': case 'COMPLETED': case 'PUBLISHED': case 'SUCCESS': case 'ONLINE': case 'CONNECTED': case 'READY': case 'POSTED': case 'UPLOAD_DONE': return 'green';
    case 'CHANGES_REQUESTED': case 'OVERDUE': case 'BLOCKED': case 'FAILED': case 'EXPIRED': case 'URGENT': case 'ERROR': case 'SHOOT_CANCELLED': return 'red';
    case 'WAITING_FOR_CLIENT': case 'PENDING': case 'REVIEW': case 'REVIEW_REQUIRED': case 'AWAY': case 'HIGH': case 'OPENED': case 'IN_REVIEW': case 'ONBOARDING': case 'PAUSED': case 'NEEDS_REVIEW': case 'CLIENT_REVIEW': return 'amber';
    case 'IN_PROGRESS': case 'ACTIVE': case 'SENT': case 'DELIVERED': case 'SCHEDULED': case 'SUBMITTED': case 'SCHEDULING': return 'blue';
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

export function getWorkflowStagesForType(type?: string): string[] {
  const t = (type || 'REEL').toUpperCase();
  if (t === 'POST') {
    return ['IDEA', 'GRAPHIC_DESIGN', 'SMM_REVIEW', 'CLIENT_FINAL_APPROVAL', 'SCHEDULE', 'PUBLISHED'];
  }
  if (t === 'CAROUSEL') {
    return ['IDEA', 'GRAPHIC_DESIGN', 'SMM_REVIEW', 'CLIENT_FINAL_APPROVAL', 'SCHEDULE', 'PUBLISHED'];
  }
  if (t === 'AI_REEL') {
    return ['IDEA', 'SCRIPT', 'INTERNAL_REVIEW', 'VOICE_OVER', 'AI_GENERATION', 'EDITING', 'SMM_REVIEW', 'FINAL_REVIEW', 'CLIENT_FINAL_APPROVAL', 'SCHEDULE', 'PUBLISHED'];
  }
  if (t === 'AI_IMAGE') {
    return ['IDEA', 'AI_GENERATION', 'GRAPHIC_DESIGN', 'SMM_REVIEW', 'CLIENT_FINAL_APPROVAL', 'SCHEDULE', 'PUBLISHED'];
  }
  if (['STORY', 'AD', 'OTHER'].includes(t)) {
    return ['IDEA', 'SCRIPT', 'GRAPHIC_DESIGN', 'SMM_REVIEW', 'FINAL_REVIEW', 'CLIENT_FINAL_APPROVAL', 'SCHEDULE', 'PUBLISHED'];
  }
  // Default Reel workflow (past complete workflow)
  return [
    'IDEA', 'SCRIPT', 'INTERNAL_REVIEW', 'CLIENT_REVIEW', 'SHOOTING', 'RAW_FOOTAGE',
    'EDITING', 'SMM_REVIEW', 'FINAL_REVIEW', 'CLIENT_FINAL_APPROVAL', 'SCHEDULE', 'PUBLISHED'
  ];
}

export const stageNumber = (s: string, type?: string) => {
  const stages = getWorkflowStagesForType(type);
  const idx = stages.indexOf(s);
  return idx >= 0 ? idx + 1 : 1;
};
