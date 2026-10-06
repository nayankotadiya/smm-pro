export const STAGES = [
  'IDEA', 'SCRIPT', 'INTERNAL_REVIEW', 'CLIENT_REVIEW', 'SHOOTING', 'RAW_FOOTAGE',
  'EDITING', 'SMM_REVIEW', 'FINAL_REVIEW', 'CLIENT_FINAL_APPROVAL', 'SCHEDULE', 'PUBLISHED',
] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_LABELS: Record<Stage, string> = {
  IDEA: 'Idea', SCRIPT: 'Script', INTERNAL_REVIEW: 'Internal Review', CLIENT_REVIEW: 'Client Review',
  SHOOTING: 'Shooting', RAW_FOOTAGE: 'Raw Footage', EDITING: 'Editing', SMM_REVIEW: 'SMM Review',
  FINAL_REVIEW: 'Final Review', CLIENT_FINAL_APPROVAL: 'Client Final Approval', SCHEDULE: 'Schedule', PUBLISHED: 'Published',
};

/** Which assignment field owns each stage */
export const STAGE_OWNER_FIELD: Record<Stage, string> = {
  IDEA: 'assignedWriter', SCRIPT: 'assignedWriter', INTERNAL_REVIEW: 'assignedReviewer', CLIENT_REVIEW: 'assignedReviewer',
  SHOOTING: 'assignedShooter', RAW_FOOTAGE: 'assignedEditor', EDITING: 'assignedEditor', SMM_REVIEW: 'assignedSMM',
  FINAL_REVIEW: 'assignedReviewer', CLIENT_FINAL_APPROVAL: 'assignedReviewer', SCHEDULE: 'assignedSMM', PUBLISHED: 'assignedSMM',
};

export const STAGE_NEXT_ACTION: Record<Stage, string> = {
  IDEA: 'Write the first script draft',
  SCRIPT: 'Complete script and submit for review',
  INTERNAL_REVIEW: 'Internal script review required',
  CLIENT_REVIEW: 'Waiting for client script approval',
  SHOOTING: 'Plan and complete the shoot',
  RAW_FOOTAGE: 'Editor to start editing raw footage',
  EDITING: 'Upload edit for SMM review',
  SMM_REVIEW: 'SMM review required',
  FINAL_REVIEW: 'Final internal review required',
  CLIENT_FINAL_APPROVAL: 'Waiting for client final approval',
  SCHEDULE: 'Schedule the post',
  PUBLISHED: 'Published — add report',
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
  SMM: ['clients.read', 'content.write', 'approvals.review', 'approvals.send', 'media.upload', 'communication.write'],
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
