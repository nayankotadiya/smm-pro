export const STAGES = [
  'IDEA', 'BRIEF', 'SCRIPT', 'INTERNAL_REVIEW', 'CLIENT_REVIEW', 'VOICE_OVER',
  'SHOOTING', 'RAW_FOOTAGE', 'GRAPHIC_DESIGN', 'AI_GENERATION',
  'EDITING', 'SMM_REVIEW', 'FINAL_REVIEW', 'CLIENT_FINAL_APPROVAL', 'FINAL_UPLOAD',
  'SCHEDULE', 'PUBLISHED',
] as const;
export type Stage = (typeof STAGES)[number];

export const CONTENT_TYPES = [
  'REEL', 'POST', 'CAROUSEL', 'AI_REEL', 'AI_IMAGE', 'STORY', 'VIDEO', 'SHORT', 'AD', 'OTHER'
] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

export const STAGE_LABELS: Record<Stage, string> = {
  IDEA: 'Idea',
  BRIEF: 'Content Brief',
  SCRIPT: 'Script / Copywriting',
  INTERNAL_REVIEW: 'Internal Review',
  CLIENT_REVIEW: 'Client Script Review',
  VOICE_OVER: 'Voice-Over',
  SHOOTING: 'Shooting',
  RAW_FOOTAGE: 'Raw Footage',
  GRAPHIC_DESIGN: 'Graphic Design',
  AI_GENERATION: 'AI Generation',
  EDITING: 'Video Editing',
  SMM_REVIEW: 'SMM Review',
  FINAL_REVIEW: 'Final Review',
  CLIENT_FINAL_APPROVAL: 'Client Final Approval',
  FINAL_UPLOAD: 'Final Export & Upload',
  SCHEDULE: 'Scheduling',
  PUBLISHED: 'Published',
};

/** Which assignment field owns each stage */
export const STAGE_OWNER_FIELD: Record<Stage, string> = {
  IDEA: 'assignedWriter',
  BRIEF: 'assignedWriter',
  SCRIPT: 'assignedWriter',
  INTERNAL_REVIEW: 'assignedReviewer',
  CLIENT_REVIEW: 'assignedReviewer',
  VOICE_OVER: 'assignedWriter',
  SHOOTING: 'assignedShooter',
  RAW_FOOTAGE: 'assignedEditor',
  GRAPHIC_DESIGN: 'assignedDesigner',
  AI_GENERATION: 'assignedDesigner',
  EDITING: 'assignedEditor',
  SMM_REVIEW: 'assignedSMM',
  FINAL_REVIEW: 'assignedReviewer',
  CLIENT_FINAL_APPROVAL: 'assignedReviewer',
  FINAL_UPLOAD: 'assignedEditor',
  SCHEDULE: 'assignedSMM',
  PUBLISHED: 'assignedSMM',
};

export const STAGE_NEXT_ACTION: Record<Stage, string> = {
  IDEA: 'Develop the idea and brief',
  BRIEF: 'Write the script or copywriting',
  SCRIPT: 'Complete script/copy and submit for review',
  INTERNAL_REVIEW: 'Internal script review required',
  CLIENT_REVIEW: 'Waiting for client script approval',
  VOICE_OVER: 'Record or generate voice-over',
  SHOOTING: 'Plan and complete the shoot',
  RAW_FOOTAGE: 'Upload raw footage for editing',
  GRAPHIC_DESIGN: 'Design graphics or slides',
  AI_GENERATION: 'Generate AI reel/visuals and review outputs',
  EDITING: 'Upload video edit for SMM review',
  SMM_REVIEW: 'SMM manager review required',
  FINAL_REVIEW: 'Final internal review required',
  CLIENT_FINAL_APPROVAL: 'Waiting for client final approval',
  FINAL_UPLOAD: 'Export and upload final creative assets',
  SCHEDULE: 'Schedule the post for publishing',
  PUBLISHED: 'Published — log live URL and metrics',
};

/** Workflow stages customized by content type */
export function getWorkflowStagesForType(type: string): Stage[] {
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

/** Configurable Status Colors based on Google Sheets Reference & Operational States */
export interface StatusConfigItem {
  code: string;
  label: string;
  color: string; // Hex background
  textColor: string; // Hex text
  category: 'production' | 'review' | 'operational';
}

export const STATUS_CONFIG: Record<string, StatusConfigItem> = {
  // Google Sheets reference colors
  SCRIPT_DONE: { code: 'SCRIPT_DONE', label: 'Script Done', color: '#00D9E8', textColor: '#000000', category: 'production' },
  VOICE_OVER: { code: 'VOICE_OVER', label: 'Voice Over', color: '#9575CD', textColor: '#FFFFFF', category: 'production' },
  SHOOT: { code: 'SHOOT', label: 'Shoot', color: '#FF9800', textColor: '#000000', category: 'production' },
  EDIT_DONE: { code: 'EDIT_DONE', label: 'Edit Done', color: '#FFEB00', textColor: '#000000', category: 'production' },
  SCHEDULING: { code: 'SCHEDULING', label: 'Scheduling', color: '#E600E6', textColor: '#FFFFFF', category: 'production' },
  UPLOAD_DONE: { code: 'UPLOAD_DONE', label: 'Upload Done', color: '#00E600', textColor: '#000000', category: 'production' },
  SHOOT_CANCELLED: { code: 'SHOOT_CANCELLED', label: 'Shoot Cancelled', color: '#FF0000', textColor: '#FFFFFF', category: 'production' },
  CLIENT_REVIEW: { code: 'CLIENT_REVIEW', label: 'Client Review', color: '#C98555', textColor: '#FFFFFF', category: 'review' },
  TRAIL: { code: 'TRAIL', label: 'Trail', color: '#B39DDB', textColor: '#000000', category: 'production' },

  // Operational statuses
  NOT_STARTED: { code: 'NOT_STARTED', label: 'Not Started', color: '#64748B', textColor: '#FFFFFF', category: 'operational' },
  IN_PROGRESS: { code: 'IN_PROGRESS', label: 'In Progress', color: '#3B82F6', textColor: '#FFFFFF', category: 'operational' },
  NEEDS_REVIEW: { code: 'NEEDS_REVIEW', label: 'Needs Review', color: '#F59E0B', textColor: '#000000', category: 'operational' },
  CHANGES_REQUIRED: { code: 'CHANGES_REQUIRED', label: 'Changes Required', color: '#F97316', textColor: '#FFFFFF', category: 'operational' },
  APPROVED: { code: 'APPROVED', label: 'Approved', color: '#10B981', textColor: '#FFFFFF', category: 'operational' },
  PENDING_CLIENT_APPROVAL: { code: 'PENDING_CLIENT_APPROVAL', label: 'Pending Client Approval', color: '#C98555', textColor: '#FFFFFF', category: 'operational' },
  SCHEDULED: { code: 'SCHEDULED', label: 'Scheduled', color: '#E600E6', textColor: '#FFFFFF', category: 'operational' },
  POSTED: { code: 'POSTED', label: 'Posted', color: '#00E600', textColor: '#000000', category: 'operational' },
  OVERDUE: { code: 'OVERDUE', label: 'Overdue', color: '#EF4444', textColor: '#FFFFFF', category: 'operational' },
  CANCELLED: { code: 'CANCELLED', label: 'Cancelled', color: '#DC2626', textColor: '#FFFFFF', category: 'operational' },
  NOT_REQUIRED: { code: 'NOT_REQUIRED', label: 'Not Required', color: '#94A3B8', textColor: '#000000', category: 'operational' },
  BLOCKED: { code: 'BLOCKED', label: 'Blocked', color: '#B91C1C', textColor: '#FFFFFF', category: 'operational' },
  COMPLETED: { code: 'COMPLETED', label: 'Completed', color: '#059669', textColor: '#FFFFFF', category: 'operational' },
  ACTIVE: { code: 'ACTIVE', label: 'Active', color: '#3B82F6', textColor: '#FFFFFF', category: 'operational' },
};

export const ROLES = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'TEAM_LEAD', 'SCRIPT_WRITER', 'SHOOTER', 'EDITOR', 'SMM', 'DESIGNER', 'SUPPORT'] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  'dashboard.org', 'clients.read', 'clients.write', 'clients.delete',
  'content.read.all', 'content.write', 'content.assign',
  'scripts.write', 'scripts.review',
  'approvals.send', 'approvals.review',
  'media.upload', 'media.read.all',
  'tasks.manage', 'tasks.read.all',
  'communication.write', 'reports.view',
  'automations.manage', 'users.manage', 'roles.manage', 'integrations.manage', 'audit.view',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ALL = [...PERMISSIONS] as Permission[];
const MANAGER_P: Permission[] = ALL.filter((p) => !['users.manage', 'roles.manage', 'integrations.manage'].includes(p));
export const DEFAULT_ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  SUPER_ADMIN: ALL,
  ADMIN: ALL,
  MANAGER: MANAGER_P,
  TEAM_LEAD: ['clients.read', 'content.read.all', 'content.write', 'content.assign', 'scripts.write', 'scripts.review', 'approvals.review', 'approvals.send', 'media.upload', 'media.read.all', 'tasks.manage', 'tasks.read.all', 'communication.write', 'reports.view'],
  SCRIPT_WRITER: ['clients.read', 'scripts.write', 'content.write', 'media.upload'],
  SHOOTER: ['clients.read', 'media.upload'],
  EDITOR: ['clients.read', 'media.upload'],
  SMM: ['clients.read', 'content.read.all', 'content.write', 'approvals.review', 'approvals.send', 'media.upload', 'communication.write'],
  DESIGNER: ['clients.read', 'media.upload'],
  SUPPORT: ['clients.read', 'clients.write', 'communication.write', 'tasks.manage', 'approvals.send', 'media.upload'],
};

export const MEDIA_CATEGORIES = ['RAW', 'EDIT', 'FINAL', 'THUMBNAIL', 'IMAGE', 'DOCUMENT', 'AUDIO', 'REFERENCE', 'BRAND_ASSET', 'CHAT'] as const;
export type MediaCategory = (typeof MEDIA_CATEGORIES)[number];

export const CLIENT_SUBFOLDERS = ['01_Brand_Assets', '02_Content_Ideas', '03_Scripts', '04_Raw_Footage', '05_Editing', '06_Review', '07_Final', '08_Scheduled', '09_Published', '10_Other'];
export const CONTENT_SUBFOLDERS = ['01_Script', '02_References', '03_Raw', '04_Edit_Versions', '05_Review', '06_Final'];
export const CATEGORY_CONTENT_FOLDER: Record<string, string> = {
  RAW: '03_Raw', EDIT: '04_Edit_Versions', FINAL: '06_Final', THUMBNAIL: '06_Final', REFERENCE: '02_References',
  DOCUMENT: '01_Script', IMAGE: '02_References', AUDIO: '02_References', BRAND_ASSET: '02_References', CHAT: '05_Review',
};

export const NOTIFICATION_CATEGORIES = ['TASK', 'APPROVAL', 'CHAT', 'REMINDER', 'DEADLINE', 'FILES', 'WORKFLOW', 'SYSTEM'] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export const ALLOWED_MIME_PREFIX = [
  'video/',
  'image/',
  'audio/',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats',
  'application/vnd.ms-',
  'text/plain',
  'text/csv',
  'application/zip',
  'application/x-matroska',
  'application/x-rar',
  'application/x-7z',
];
