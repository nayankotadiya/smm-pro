export interface ClientUser {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  role: 'CLIENT_ADMIN' | 'CLIENT_MEMBER';
  client: {
    _id: string;
    name: string;
  };
}

export interface BrandInfo {
  _id: string;
  name: string;
  businessName: string;
  category?: string;
  brandTone?: string;
  brandColors?: string[];
  fonts?: string[];
  logoUrl?: string | null;
  accountManager?: {
    name: string;
    title: string;
  } | null;
}

export interface PendingApproval {
  _id: string;
  type: 'CLIENT_SCRIPT' | 'CLIENT_FINAL';
  version: string;
  status: string;
  title: string;
  contentId: string;
  contentType: string;
  deadline?: string;
  sentAt?: string;
}

export interface DashboardStats {
  totalThisMonth: number;
  publishedCount: number;
  scheduledCount: number;
  inProductionCount: number;
  pendingApprovalCount: number;
}

export interface UpcomingPost {
  _id: string;
  contentId: string;
  title: string;
  type: string;
  platform: string;
  scheduledAt?: string;
  publishedAt?: string;
  caption?: string;
}

export interface ApprovalDetail {
  _id: string;
  brand: string;
  title: string;
  contentId: string;
  version: string;
  type: 'CLIENT_SCRIPT' | 'CLIENT_FINAL';
  status: string;
  decided: boolean;
  caption?: string;
  hashtags?: string;
  description?: string;
  script?: {
    hook?: string;
    scenes?: Array<{ title?: string; dialogue?: string; visual?: string }>;
    dialogue?: string;
    body?: string;
    cta?: string;
    captionNotes?: string;
    duration?: string;
    music?: string;
  } | null;
  hasVideo: boolean;
  hasThumbnail: boolean;
  videoUrl?: string;
  thumbnailUrl?: string | null;
  webViewLink?: string | null;
  fileName?: string | null;
  feedback?: Array<{
    comment: string;
    timestampSec?: number;
    authorType: string;
    authorName: string;
    createdAt: string;
  }>;
  createdAt: string;
  decidedAt?: string;
}

export interface ContentItem {
  _id: string;
  contentId: string;
  title: string;
  type: string;
  platform: string;
  stage: string;
  clientStatus: string;
  progress: number;
  scheduledAt?: string;
  publishedAt?: string;
  caption?: string;
  hashtags?: string;
}

export interface ClientBrief {
  _id: string;
  title: string;
  objective?: string;
  contentType: string;
  targetPlatform: string;
  notes?: string;
  referenceUrls?: string[];
  status: 'SUBMITTED' | 'IN_REVIEW' | 'ACCEPTED' | 'DECLINED';
  createdAt: string;
}
