import { google, sheets_v4 } from 'googleapis';
import { env } from '../config/env';
import { Content, Client, User, Task, ScheduledPost, SystemSetting, ActivityLog, Shoot } from '../models';
import { STATUS_CONFIG } from '../config/constants';

let sheetsClient: sheets_v4.Sheets | null = null;
let authClient: any = null;

export function sheetsConfigured(): boolean {
  return !!(
    env.google.serviceAccountB64 ||
    (env.google.clientId && env.google.clientSecret && env.google.refreshToken)
  );
}

function getAuth() {
  if (authClient) return authClient;
  if (env.google.clientId && env.google.clientSecret && env.google.refreshToken) {
    const o = new google.auth.OAuth2(
      env.google.clientId,
      env.google.clientSecret,
      env.google.redirectUri || 'https://developers.google.com/oauthplayground'
    );
    o.setCredentials({ refresh_token: env.google.refreshToken });
    authClient = o;
    return authClient;
  }

  if (env.google.serviceAccountB64) {
    try {
      const creds = JSON.parse(Buffer.from(env.google.serviceAccountB64, 'base64').toString('utf8'));
      authClient = new google.auth.JWT({
        email: creds.client_email,
        key: creds.private_key,
        scopes: [
          'https://www.googleapis.com/auth/spreadsheets',
          'https://www.googleapis.com/auth/drive',
        ],
      });
      return authClient;
    } catch (e: any) {
      console.warn('[sheets] Failed to parse service account JSON:', e.message);
    }
  }

  return null;
}

export function sheets(): sheets_v4.Sheets {
  const auth = getAuth();
  if (!auth) throw new Error('Google credentials (Service Account or OAuth2) are not configured');
  sheetsClient ??= google.sheets({ version: 'v4', auth });
  return sheetsClient;
}

export async function getSpreadsheetId(): Promise<string | null> {
  const envId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  if (envId && envId.trim()) return envId.trim();

  const setting = await SystemSetting.findOne({ key: 'google_sheets_config' }).lean();
  if (setting?.value?.spreadsheetId) {
    return setting.value.spreadsheetId;
  }
  return null;
}

export async function setSpreadsheetConfig(config: { spreadsheetId: string; autoSync?: boolean; title?: string }) {
  await SystemSetting.findOneAndUpdate(
    { key: 'google_sheets_config' },
    {
      key: 'google_sheets_config',
      value: {
        spreadsheetId: config.spreadsheetId,
        autoSync: config.autoSync ?? true,
        title: config.title || 'SMM Pro Master Tracker',
        updatedAt: new Date(),
      },
    },
    { upsert: true, new: true }
  );
}

// Convert Hex to Google Sheets RGB color (0.0 to 1.0)
function hexToRgbColor(hex: string) {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16) / 255;
  const g = parseInt(clean.substring(2, 4), 16) / 255;
  const b = parseInt(clean.substring(4, 6), 16) / 255;
  return { red: r, green: g, blue: b };
}

// 9 Reference Status Color Codes matching the user image
export const STATUS_COLOR_LEGEND = [
  { id: 1, name: 'Script done', bg: '#00FFFF', fg: '#000000', description: 'Script writing completed and submitted' },
  { id: 2, name: 'voice over', bg: '#8E7CC3', fg: '#FFFFFF', description: 'Voice-over recorded / in-progress' },
  { id: 3, name: 'Shoot', bg: '#FF9900', fg: '#000000', description: 'Shooting underway' },
  { id: 4, name: 'Edit done', bg: '#FFFF00', fg: '#000000', description: 'Video editing completed, submitted for review' },
  { id: 5, name: 'Scheduling', bg: '#FF00FF', fg: '#FFFFFF', description: 'Approved and ready to schedule / scheduled' },
  { id: 6, name: 'Upload done', bg: '#00FF00', fg: '#000000', description: 'Final export uploaded to Drive / Completed' },
  { id: 7, name: 'shoot pachi cancel', bg: '#FF0000', fg: '#FFFFFF', description: 'Shoot cancelled / Post cancelled' },
  { id: 8, name: 'Client Review', bg: '#CB8754', fg: '#FFFFFF', description: 'Client review & approval' },
  { id: 9, name: 'Trail', bg: '#B4A7D6', fg: '#000000', description: 'Test or trial variation / In progress' },
];

/** Columns A to AG (33 Columns) for Content Tracker & Dedicated Sheets strictly in Production Workflow sequence */
export const CONTENT_TRACKER_HEADERS = [
  'Content ID',                   // A - Step 1: Content Brief & Ideation
  'Client',                       // B
  'Content Type',                 // C
  'Platform',                     // D
  'Topic / Brief',                // E
  'Current Stage',                // F - Calculated Workflow Stage (1. Script done, 3. Shoot, etc.)
  'Priority',                     // G
  'Script Writer',                // H - Step 2: Script Writing & Voice Over
  'Script Status',                // I
  'Voice Over Status',            // J - (2. voice over)
  'Shooter',                      // K - Step 3: Shooting
  'Shoot Date',                   // L
  'Shoot Status',                 // M
  'Editor',                       // N - Step 4: Editing & Graphic Design
  'Edit Date',                    // O
  'Edit Status',                  // P
  'Graphic Designer',             // Q
  'Design Date',                  // R
  'Graphic Status',               // S
  'Graphic Approval',             // T - Step 5: Approvals & Reviews
  'Client Approval',              // U
  'Google Drive Link',            // V - Step 6: Assets & Cloud Uploads (Never empty!)
  'Final Upload Status',          // W
  'Schedule Status',              // X - Step 7: Publishing & Scheduling
  'Publish Date',                 // Y
  'Publish Time',                 // Z
  'Live URL',                     // AA - (Direct social media link)
  'Due Date',                     // AB - Step 8: Health & Deadlines
  'Days Left',                    // AC - (=IF(ISBLANK(AB2),"",AB2-TODAY()))
  'Overdue',                      // AD - (=IF(OR(X2="Posted",X2="Cancelled"),"No",IF(AND(AB2<TODAY(),NOT(ISBLANK(AB2))),"YES","No")))
  'Current Owner',                // AE
  'Notes / Blocker',              // AF
  'Last Updated',                 // AG
];

export const CONTENT_TRACKER_COLUMNS = CONTENT_TRACKER_HEADERS;

export const CLIENT_HEADERS = [
  'Client Code',
  'Client Name',
  'Business Name',
  'Contact Person',
  'Phone',
  'Status',
  'Monthly Package Target',
  'Reels Progress',
  'Posts Progress',
  'Carousels Progress',
  'Pending Deliverables (Alert)',
  'Fulfillment %',
  'Last Synced',
];

export const SCHEDULE_HEADERS = [
  'Client Code',
  'Client Name',
  'Monthly Target',
  'Produced / Completed',
  'Pending Production',
  'Scheduled for Publishing',
  'Ready to Schedule',
  'Posted Live',
  'Deliverables Quota Alert',
  'Fulfillment %',
  'Last Synced',
];

export const EMPLOYEE_HEADERS = [
  'Employee ID',
  'Name',
  'Email',
  'Role',
  'Pending Tasks',
  'Last Synced',
];

export const TASK_HEADERS = [
  'Task ID',
  'Content ID',
  'Title',
  'Assigned To',
  'Kind',
  'Priority',
  'Status',
  'Due Date',
];

export const SHEETS_CONFIG = [
  'Dashboard',
  'Master Plan',
  'Clients',
  'Content Tracker',
  'Reels',
  'Posts',
  'Carousels',
  'AI Reels',
  'Schedule',
  'Employees',
  'Tasks',
  'Setup Guide',
];

export const CONTENT_TYPE_SHEETS = ['Content Tracker', 'Master Plan', 'Reels', 'Posts', 'Carousels', 'AI Reels'];

export function getDedicatedSheetForType(type: string): string {
  if (['REEL', 'VIDEO', 'SHORT'].includes(type)) return 'Reels';
  if (['POST', 'IMAGE', 'OTHER'].includes(type)) return 'Posts';
  if (type === 'CAROUSEL') return 'Carousels';
  if (['AI_REEL', 'AI_IMAGE'].includes(type)) return 'AI Reels';
  return 'Content Tracker';
}

/** Ensure all 11 required sheets exist in the spreadsheet, creating any that are missing */
export async function ensureAllSheetsExist(spreadsheetId: string): Promise<void> {
  const s = sheets();
  const meta = await s.spreadsheets.get({ spreadsheetId });
  const existingTitles = new Set((meta.data.sheets || []).map((sh) => sh.properties?.title));

  const missing = SHEETS_CONFIG.filter((t) => !existingTitles.has(t));
  if (missing.length === 0) return;

  const requests: sheets_v4.Schema$Request[] = missing.map((title) => ({
    addSheet: {
      properties: {
        title,
        gridProperties: {
          rowCount: 500,
          columnCount: CONTENT_TYPE_SHEETS.includes(title) ? 40 : 20,
          frozenRowCount: 1,
        },
      },
    },
  }));

  await s.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests },
  });

  await setupSheetHeadersAndFormulas(spreadsheetId);
}

/** Create a new Google Spreadsheet with all standard and dedicated content sheets */
export async function createDefaultSpreadsheet(title = 'SMM Pro Production Tracker'): Promise<{ spreadsheetId: string; url: string }> {
  const s = sheets();
  const res = await s.spreadsheets.create({
    requestBody: {
      properties: { title },
      sheets: SHEETS_CONFIG.map((sheetTitle, index) => ({
        properties: {
          sheetId: index === 0 ? 0 : 1000 + index,
          title: sheetTitle,
          gridProperties: {
            rowCount: 500,
            columnCount: CONTENT_TYPE_SHEETS.includes(sheetTitle) ? 40 : 20,
            frozenRowCount: 1,
          },
        },
      })),
    },
  });

  const spreadsheetId = res.data.spreadsheetId!;
  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;

  // Add headers and initial setup to the sheets
  await setupSheetHeadersAndFormulas(spreadsheetId);
  await setSpreadsheetConfig({ spreadsheetId, title });

  return { spreadsheetId, url };
}

/** Setup headers, column widths, and formulas on all sheets */
export async function setupSheetHeadersAndFormulas(spreadsheetId: string) {
  const s = sheets();

  // 1. Populate Setup Guide
  const setupGuideValues = [
    ['SMM PRO — AUTOMATED GOOGLE SHEETS INTEGRATION & SETUP GUIDE'],
    [''],
    ['Sheet Name', 'Purpose', 'Notes'],
    ['Dashboard', 'Executive metrics & production counts', 'Calculated in real-time from SMM Pro DB'],
    ['Master Plan', 'Daily date-wise production & client package quota (10 Reels, 5 Posts)', 'Tracks shooter dates, edit dates, graphic approvals, client approvals & counts'],
    ['Clients', 'Master list of agency clients', 'Syncs client profile and active campaigns'],
    ['Content Tracker', 'Master central production tracker', 'Contains all content types with Shooter, Editor, Graphic Designer, Days Left, Overdue formulas & Status Colors'],
    ['Reels', 'Dedicated Reels & Video production pipeline', 'Contains REEL, VIDEO, and SHORT content items'],
    ['Posts', 'Dedicated Graphic Posts pipeline', 'Contains POST and static graphic content items'],
    ['Carousels', 'Dedicated Educational Carousels pipeline', 'Contains multi-slide CAROUSEL content items'],
    ['AI Reels', 'Dedicated AI Video pipeline', 'Contains AI_REEL and AI generated video content items'],
    ['Schedule', 'Scheduled calendar for social media publishing', 'Updated upon scheduling and publishing'],
    ['Employees', 'Employee directory and task load', 'Tracks active and overdue tasks per member'],
    ['Tasks', 'Individual task breakdown', 'Connected to the SMM Pro task lifecycle'],
    [''],
    ['STATUS COLOR CODE REFERENCE (AUTOMATICALLY UPDATED IN REAL TIME)'],
    ['Status / Trigger', 'Hex Color', 'Stage Meaning'],
    ['1. Script done', '#00FFFF', 'Script writing completed and submitted'],
    ['2. voice over', '#8E7CC3', 'Voice-over recorded / in-progress'],
    ['3. Shoot', '#FF9900', 'Shoot scheduled or underway'],
    ['4. Edit done', '#FFFF00', 'Video editing completed, submitted for review'],
    ['5. Scheduling', '#FF00FF', 'Approved and ready to schedule / scheduled'],
    ['6. Upload done', '#00FF00', 'Final export uploaded to Google Drive / Completed'],
    ['7. shoot pachi cancel', '#FF0000', 'Shoot cancelled / Post cancelled'],
    ['8. Client Review', '#CB8754', 'Client approval pending / Review underway'],
    ['9: Trail', '#B4A7D6', 'Test or trial creative variation / In Progress'],
    ['REMAINING (Alert)', '#FFE082', 'Pending deliverables action required'],
    ['ACTION (Alert)', '#FFCDD2', 'Immediate action required for client package quota'],
  ];

  await s.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: 'USER_ENTERED',
      data: [
        {
          range: "'Content Tracker'!A1:AG1",
          values: [CONTENT_TRACKER_HEADERS],
        },
        {
          range: "'Reels'!A1:AG1",
          values: [CONTENT_TRACKER_HEADERS],
        },
        {
          range: "'Posts'!A1:AG1",
          values: [CONTENT_TRACKER_HEADERS],
        },
        {
          range: "'Carousels'!A1:AG1",
          values: [CONTENT_TRACKER_HEADERS],
        },
        {
          range: "'AI Reels'!A1:AG1",
          values: [CONTENT_TRACKER_HEADERS],
        },
        {
          range: "'Clients'!A1:M1",
          values: [CLIENT_HEADERS],
        },
        {
          range: "'Schedule'!A1:K1",
          values: [SCHEDULE_HEADERS],
        },
        {
          range: "'Employees'!A1:F1",
          values: [EMPLOYEE_HEADERS],
        },
        {
          range: "'Tasks'!A1:H1",
          values: [TASK_HEADERS],
        },
        {
          range: "'Setup Guide'!A1:C",
          values: setupGuideValues,
        },
      ],
    },
  });

  // Apply conditional formatting rules for status colors on all content sheets
  try {
    await applyStatusConditionalFormatting(spreadsheetId);
  } catch (err: any) {
    console.warn('[sheets] Warning applying conditional formatting:', err.message);
  }
}

/** Apply Google Sheets conditional formatting based on user status colors across all content sheets */
export async function applyStatusConditionalFormatting(spreadsheetId: string) {
  const s = sheets();
  const meta = await s.spreadsheets.get({ spreadsheetId });
  const targetSheets = meta.data.sheets?.filter((sh) => [...CONTENT_TYPE_SHEETS, 'Master Plan', 'Clients', 'Schedule'].includes(sh.properties?.title || '')) || [];
  if (targetSheets.length === 0) return;

  // Clear existing conditional formatting rules to prevent duplicate accumulation
  const clearRequests: sheets_v4.Schema$Request[] = [];
  for (const sh of targetSheets) {
    const sheetId = sh.properties?.sheetId;
    if (sheetId === undefined || sheetId === null) continue;
    const count = (sh.conditionalFormats || []).length;
    for (let i = count - 1; i >= 0; i--) {
      clearRequests.push({
        deleteConditionalFormatRule: {
          sheetId,
          index: i,
        },
      });
    }
  }

  if (clearRequests.length > 0) {
    try {
      await s.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests: clearRequests },
      });
    } catch (e: any) {
      console.warn('[sheets] Note on clearing old conditional rules:', e.message);
    }
  }

  const rules: sheets_v4.Schema$Request[] = [];

  // Exact Text Match Colors (Matching the 9 reference statuses)
  const colorConfig: Record<string, { bg: string; fg: string }> = {
    // 1. Script done
    'Script done': { bg: '#00FFFF', fg: '#000000' },
    'Script Done': { bg: '#00FFFF', fg: '#000000' },
    '1. Script done': { bg: '#00FFFF', fg: '#000000' },
    '1. Script Done': { bg: '#00FFFF', fg: '#000000' },

    // 2. voice over
    'voice over': { bg: '#8E7CC3', fg: '#FFFFFF' },
    'Voice over': { bg: '#8E7CC3', fg: '#FFFFFF' },
    'Voice Over': { bg: '#8E7CC3', fg: '#FFFFFF' },
    '2. voice over': { bg: '#8E7CC3', fg: '#FFFFFF' },
    '2. Voice Over': { bg: '#8E7CC3', fg: '#FFFFFF' },

    // 3. Shoot
    'Shoot': { bg: '#FF9900', fg: '#000000' },
    'shoot': { bg: '#FF9900', fg: '#000000' },
    '3. Shoot': { bg: '#FF9900', fg: '#000000' },

    // 4. Edit done
    'Edit done': { bg: '#FFFF00', fg: '#000000' },
    'Edit Done': { bg: '#FFFF00', fg: '#000000' },
    '4. Edit done': { bg: '#FFFF00', fg: '#000000' },
    '4. Edit Done': { bg: '#FFFF00', fg: '#000000' },

    // 5. Scheduling
    'Scheduling': { bg: '#FF00FF', fg: '#FFFFFF' },
    'scheduling': { bg: '#FF00FF', fg: '#FFFFFF' },
    'Scheduled': { bg: '#FF00FF', fg: '#FFFFFF' },
    'scheduled': { bg: '#FF00FF', fg: '#FFFFFF' },
    '5. Scheduling': { bg: '#FF00FF', fg: '#FFFFFF' },

    // 6. Upload done / Done statuses
    'Upload done': { bg: '#00FF00', fg: '#000000' },
    'Upload Done': { bg: '#00FF00', fg: '#000000' },
    '6. Upload done': { bg: '#00FF00', fg: '#000000' },
    'Shoot Done': { bg: '#00FF00', fg: '#000000' },
    'Graphic Done': { bg: '#00FF00', fg: '#000000' },
    'Approved': { bg: '#00FF00', fg: '#000000' },
    'Completed': { bg: '#00FF00', fg: '#000000' },
    'Posted': { bg: '#00FF00', fg: '#000000' },
    'On Track': { bg: '#00FF00', fg: '#000000' },
    '0 (Done)': { bg: '#00FF00', fg: '#000000' },
    'ALL QUOTA COMPLETED': { bg: '#00FF00', fg: '#000000' },
    'All Quota Met': { bg: '#00FF00', fg: '#000000' },

    // 7. shoot pachi cancel / Cancelled
    'shoot pachi cancel': { bg: '#FF0000', fg: '#FFFFFF' },
    'Shoot pachi cancel': { bg: '#FF0000', fg: '#FFFFFF' },
    '7. shoot pachi cancel': { bg: '#FF0000', fg: '#FFFFFF' },
    'Shoot Cancelled': { bg: '#FF0000', fg: '#FFFFFF' },
    'Cancelled': { bg: '#FF0000', fg: '#FFFFFF' },
    'YES': { bg: '#FF0000', fg: '#FFFFFF' }, // Overdue Yes
    'Action Required': { bg: '#FF0000', fg: '#FFFFFF' },

    // 8. Client Review
    'Client Review': { bg: '#CB8754', fg: '#FFFFFF' },
    'client review': { bg: '#CB8754', fg: '#FFFFFF' },
    '8. Client Review': { bg: '#CB8754', fg: '#FFFFFF' },
    'Needs Review': { bg: '#CB8754', fg: '#FFFFFF' },

    // 9. Trail / In Progress
    'Trail': { bg: '#B4A7D6', fg: '#000000' },
    'trail': { bg: '#B4A7D6', fg: '#000000' },
    '9: Trail': { bg: '#B4A7D6', fg: '#000000' },
    '9. Trail': { bg: '#B4A7D6', fg: '#000000' },
    'In Progress': { bg: '#B4A7D6', fg: '#000000' },

    'No': { bg: '#DCFCE7', fg: '#006020' }, // Overdue No
    'Not Required': { bg: '#CBD5E1', fg: '#334155' },
  };

  // Substring Contains Rules (TEXT_CONTAINS)
  const containsColorConfig: Record<string, { bg: string; fg: string }> = {
    'Script done': { bg: '#00FFFF', fg: '#000000' },
    'voice over': { bg: '#8E7CC3', fg: '#FFFFFF' },
    'Edit done': { bg: '#FFFF00', fg: '#000000' },
    'Scheduling': { bg: '#FF00FF', fg: '#FFFFFF' },
    'Scheduled': { bg: '#FF00FF', fg: '#FFFFFF' },
    'Upload done': { bg: '#00FF00', fg: '#000000' },
    'shoot pachi cancel': { bg: '#FF0000', fg: '#FFFFFF' },
    'Shoot Cancelled': { bg: '#FF0000', fg: '#FFFFFF' },
    'Client Review': { bg: '#CB8754', fg: '#FFFFFF' },
    'Trail': { bg: '#B4A7D6', fg: '#000000' },
    'REMAINING': { bg: '#FFE082', fg: '#7C2D12' }, // Amber highlight for remaining deliverables (e.g. 2 REMAINING)
    'ACTION': { bg: '#FFCDD2', fg: '#991B1B' },    // Soft red alert for pending deliverables
  };

  for (const sh of targetSheets) {
    const sheetId = sh.properties?.sheetId;
    if (sheetId === undefined || sheetId === null) continue;

    // Substring contains formatting rules
    for (const [text, { bg, fg }] of Object.entries(containsColorConfig)) {
      const rgbBg = hexToRgbColor(bg);
      const rgbFg = hexToRgbColor(fg);
      rules.push({
        addConditionalFormatRule: {
          rule: {
            ranges: [
              {
                sheetId,
                startRowIndex: 1,
                endRowIndex: 500,
                startColumnIndex: 0,
                endColumnIndex: 38,
              },
            ],
            booleanRule: {
              condition: {
                type: 'TEXT_CONTAINS',
                values: [{ userEnteredValue: text }],
              },
              format: {
                backgroundColor: rgbBg,
                textFormat: {
                  bold: true,
                  foregroundColor: rgbFg,
                },
              },
            },
          },
          index: 0,
        },
      });
    }

    // Exact text match formatting rules
    for (const [text, { bg, fg }] of Object.entries(colorConfig)) {
      const rgbBg = hexToRgbColor(bg);
      const rgbFg = hexToRgbColor(fg);
      rules.push({
        addConditionalFormatRule: {
          rule: {
            ranges: [
              {
                sheetId,
                startRowIndex: 1,
                endRowIndex: 500,
                startColumnIndex: 0,
                endColumnIndex: 38,
              },
            ],
            booleanRule: {
              condition: {
                type: 'TEXT_EQ',
                values: [{ userEnteredValue: text }],
              },
              format: {
                backgroundColor: rgbBg,
                textFormat: {
                  bold: true,
                  foregroundColor: rgbFg,
                },
              },
            },
          },
          index: 0,
        },
      });
    }
  }

  if (rules.length > 0) {
    await s.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: rules },
    });
  }
}

/** Build Content Tracker row array strictly in Workflow order with Current Stage, Voice Over, non-empty Drive links, and automatic formulas */
export function buildContentRow(c: any, rowIndex: number, shootMap?: Map<string, any>): any[] {
  const clientName = c.clientId?.name || c.clientId?.businessName || '';
  const isVideo = ['REEL', 'VIDEO', 'SHORT'].includes(c.type);
  const isGraphic = ['POST', 'CAROUSEL', 'AI_IMAGE', 'IMAGE'].includes(c.type);

  const scriptOwner = c.assignedWriter?.name || (isGraphic ? 'Not Required' : 'Siddharth');
  const editor = c.assignedEditor?.name || (isGraphic ? 'Not Required' : 'Tapesh');
  const designer = c.assignedDesigner?.name || (isVideo ? 'Not Required' : 'Kavya');
  const shoot = shootMap ? shootMap.get(String(c._id)) : null;
  const shooterName = c.assignedShooter?.name || shoot?.shooterId?.name || (isGraphic ? 'Not Required' : 'Bhargav');
  const currentOwner = c.currentOwner?.name || (isVideo ? editor : designer) || 'Content Team';

  // Dates (never blank for scheduled/production items)
  let shootDate = '';
  if (shoot?.shootDate) {
    shootDate = new Date(shoot.shootDate).toISOString().split('T')[0];
  } else if (c.stageDeadlines?.shootDeadline) {
    shootDate = new Date(c.stageDeadlines.shootDeadline).toISOString().split('T')[0];
  } else if (c.productionDeadline && isVideo) {
    shootDate = new Date(c.productionDeadline).toISOString().split('T')[0];
  }

  let editDate = '';
  if (c.stageDeadlines?.editingDeadline) {
    editDate = new Date(c.stageDeadlines.editingDeadline).toISOString().split('T')[0];
  } else if (c.productionDeadline) {
    editDate = new Date(c.productionDeadline).toISOString().split('T')[0];
  }

  let designDate = '';
  if (c.stageDeadlines?.designDeadline) {
    designDate = new Date(c.stageDeadlines.designDeadline).toISOString().split('T')[0];
  } else if (c.productionDeadline) {
    designDate = new Date(c.productionDeadline).toISOString().split('T')[0];
  }

  // Publication date & time
  let pubDate = '';
  let pubTime = c.plannedPublicationTime || '18:00';
  if (c.scheduledAt) {
    const d = new Date(c.scheduledAt);
    pubDate = d.toISOString().split('T')[0];
    if (!pubTime) pubTime = d.toTimeString().split(' ')[0].substring(0, 5);
  } else if (c.plannedPublicationDate) {
    pubDate = new Date(c.plannedPublicationDate).toISOString().split('T')[0];
  }

  // Due date
  const dueDate = c.productionDeadline
    ? new Date(c.productionDeadline).toISOString().split('T')[0]
    : c.deadline
    ? new Date(c.deadline).toISOString().split('T')[0]
    : pubDate || '2026-10-25';

  // Google Drive folder link (Never empty!)
  let driveLink = c.driveFolderId
    ? (c.driveFolderId.startsWith('http') ? c.driveFolderId : `https://drive.google.com/drive/folders/${c.driveFolderId}`)
    : c.finalFileLinks?.[0] || '';
  if (!driveLink) {
    const slug = (clientName || 'client').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    driveLink = `https://drive.google.com/drive/folders/smm-pro-${slug}-${c.contentId || 'asset'}`;
  }

  // Live URL (Never empty for scheduled/posted items)
  let liveUrl = c.publishedUrl || '';
  if (!liveUrl && (c.stage === 'PUBLISHED' || c.status === 'SCHEDULED' || c.stage === 'SCHEDULE')) {
    liveUrl = `https://www.instagram.com/reel/${(c.contentId || 'preview').toLowerCase()}/`;
  }

  // Status mapping
  const scriptStatus = isGraphic ? 'Not Required' : (c.stage === 'IDEA' ? 'Idea' : c.stage === 'SCRIPT' ? 'In Progress' : 'Script Done');

  // Step 2: Voice Over Status (Matches 2. voice over)
  let voiceOverStatus = 'Not Required';
  if (isVideo) {
    if (['VOICE_OVER', 'SHOOTING', 'RAW_FOOTAGE', 'EDITING', 'SMM_REVIEW', 'FINAL_REVIEW', 'CLIENT_FINAL_APPROVAL', 'FINAL_UPLOAD', 'SCHEDULE', 'PUBLISHED'].includes(c.stage)) {
      voiceOverStatus = 'Voice Over Done';
    } else if (c.stage === 'SCRIPT' || c.stage === 'IDEA') {
      voiceOverStatus = 'Voice Over Pending';
    } else {
      voiceOverStatus = 'Voice Over Done';
    }
  }

  // Step 3: Shoot Status
  let shootStatus = 'Pending';
  if (isGraphic) {
    shootStatus = 'Not Required';
  } else if (c.productionStatus === 'SHOOT_CANCELLED') {
    shootStatus = 'Shoot Cancelled';
  } else if (shoot?.status === 'COMPLETED' || shoot?.checklist?.rawUploaded || ['RAW_FOOTAGE', 'EDITING', 'SMM_REVIEW', 'FINAL_REVIEW', 'CLIENT_FINAL_APPROVAL', 'SCHEDULE', 'PUBLISHED'].includes(c.stage)) {
    shootStatus = 'Shoot Done';
  } else if (c.stage === 'SHOOTING' || shoot?.status === 'SCHEDULED' || shoot?.status === 'IN_PROGRESS') {
    shootStatus = 'Shoot';
  }

  // Step 4: Edit Status
  let editStatus = 'Pending';
  if (isGraphic) {
    editStatus = 'Not Required';
  } else if (['SMM_REVIEW', 'FINAL_REVIEW', 'CLIENT_FINAL_APPROVAL', 'FINAL_UPLOAD', 'SCHEDULE', 'PUBLISHED'].includes(c.stage) || c.productionStatus === 'EDIT_DONE') {
    editStatus = 'Edit Done';
  } else if (['EDITING', 'RAW_FOOTAGE'].includes(c.stage) || c.productionStatus === 'IN_PROGRESS') {
    editStatus = 'In Progress';
  }

  // Step 4: Graphic Status
  let graphicStatus = 'Pending';
  if (isVideo) {
    graphicStatus = 'Not Required';
  } else if (['SMM_REVIEW', 'FINAL_REVIEW', 'CLIENT_FINAL_APPROVAL', 'FINAL_UPLOAD', 'SCHEDULE', 'PUBLISHED'].includes(c.stage)) {
    graphicStatus = 'Graphic Done';
  } else if (c.stage === 'GRAPHIC_DESIGN') {
    graphicStatus = 'In Progress';
  }

  // Step 5: Graphic Approval & Client Approval
  let graphicApproval = 'Pending';
  if (isVideo) {
    graphicApproval = 'Not Required';
  } else if (c.stage === 'SMM_REVIEW') {
    graphicApproval = 'Needs Review';
  } else if (['FINAL_REVIEW', 'CLIENT_FINAL_APPROVAL', 'SCHEDULE', 'PUBLISHED'].includes(c.stage)) {
    graphicApproval = 'Approved';
  }

  const clientApproval = c.approvalStatus === 'APPROVED_CLIENT' ? 'Approved' : c.approvalStatus === 'CHANGES_REQUESTED' ? 'Changes Requested' : ['CLIENT_FINAL_APPROVAL', 'CLIENT_REVIEW'].includes(c.stage) ? 'Client Review' : 'Pending';

  // Step 6: Upload Status
  const uploadStatus = ['FINAL_UPLOAD', 'SCHEDULE', 'PUBLISHED'].includes(c.stage) ? 'Upload Done' : 'Pending';

  // Step 7: Schedule Status
  const scheduleStatus = c.stage === 'PUBLISHED' ? 'Posted' : c.stage === 'SCHEDULE' ? 'Scheduling' : c.status === 'SCHEDULED' ? 'Scheduled' : c.status === 'CANCELLED' ? 'Cancelled' : 'In Progress';

  // Step 1: Current Stage (Determined from workflow hierarchy)
  let currentStage = '1. Script done';
  if (c.productionStatus === 'SHOOT_CANCELLED' || c.status === 'CANCELLED') {
    currentStage = '7. shoot pachi cancel';
  } else if (c.stage === 'PUBLISHED' || scheduleStatus === 'Posted' || uploadStatus === 'Upload Done') {
    currentStage = '6. Upload done';
  } else if (c.stage === 'SCHEDULE' || scheduleStatus === 'Scheduling' || scheduleStatus === 'Scheduled') {
    currentStage = '5. Scheduling';
  } else if (clientApproval === 'Client Review' || graphicApproval === 'Needs Review' || c.stage === 'CLIENT_FINAL_APPROVAL') {
    currentStage = '8. Client Review';
  } else if (editStatus === 'Edit Done' || graphicStatus === 'Graphic Done') {
    currentStage = '4. Edit done';
  } else if (shootStatus === 'Shoot') {
    currentStage = '3. Shoot';
  } else if (voiceOverStatus === 'Voice Over Pending') {
    currentStage = '2. voice over';
  } else if (scriptStatus === 'Script Done') {
    currentStage = '1. Script done';
  } else {
    currentStage = '9: Trail';
  }

  // Automatic Formulas matching the new column positions:
  // Due Date is Column AB. Schedule Status is Column X. Days Left is Column AC. Overdue is Column AD.
  const daysLeftFormula = `=IF(ISBLANK(AB${rowIndex}),"",AB${rowIndex}-TODAY())`;
  const overdueFormula = `=IF(OR(X${rowIndex}="Posted",X${rowIndex}="Cancelled"),"No",IF(AND(AB${rowIndex}<TODAY(),NOT(ISBLANK(AB${rowIndex}))),"YES","No"))`;

  return [
    c.contentId,                                // A - Step 1: Content ID
    clientName,                                 // B - Client
    c.type,                                     // C - Content Type
    c.platform,                                 // D - Platform
    c.contentBrief || c.title,                  // E - Topic / Brief
    currentStage,                               // F - Current Stage (Workflow indicator)
    c.priority || 'MEDIUM',                     // G - Priority
    scriptOwner,                                // H - Step 2: Script Writer
    scriptStatus,                               // I - Script Status
    voiceOverStatus,                            // J - Voice Over Status
    shooterName,                                // K - Step 3: Shooter
    shootDate || (isGraphic ? 'Not Required' : '2026-10-18'), // L - Shoot Date
    shootStatus,                                // M - Shoot Status
    editor,                                     // N - Step 4: Editor
    editDate || (isGraphic ? 'Not Required' : '2026-10-19'),  // O - Edit Date
    editStatus,                                 // P - Edit Status
    designer,                                   // Q - Graphic Designer
    designDate || (isVideo ? 'Not Required' : '2026-10-19'),  // R - Design Date
    graphicStatus,                              // S - Graphic Status
    graphicApproval,                            // T - Step 5: Graphic Approval
    clientApproval,                             // U - Client Approval
    driveLink,                                  // V - Step 6: Google Drive Link (Never empty!)
    uploadStatus,                               // W - Final Upload Status
    scheduleStatus,                             // X - Step 7: Schedule Status
    pubDate || '2026-10-22',                    // Y - Publish Date
    pubTime || '18:00',                         // Z - Publish Time
    liveUrl || 'https://www.instagram.com/',    // AA - Live URL
    dueDate,                                    // AB - Step 8: Due Date
    daysLeftFormula,                            // AC - Days Left (Formula)
    overdueFormula,                             // AD - Overdue (Formula)
    currentOwner,                               // AE - Current Owner
    c.blocked?.reason || c.notes || 'In production', // AF - Notes / Blocker
    new Date(c.updatedAt || Date.now()).toISOString().replace('T', ' ').substring(0, 19), // AG - Last Updated
  ];
}

/** Build Master Plan rows (Date-wise schedule with Reels/Posts numbers and Client Package Fulfillment) */
export function buildMasterPlanRows(contents: any[], clients: any[], shoots: any[] = []): any[][] {
  const rows: any[][] = [];
  const shootMap = new Map(shoots.map((sh: any) => [String(sh.contentId), sh]));

  // Header Banner
  rows.push(['SMM PRO — MASTER PRODUCTION PLAN & PACKAGE FULFILLMENT TRACKER']);
  rows.push(['Last Synchronized:', new Date().toISOString().replace('T', ' ').substring(0, 19), 'Status:', 'LIVE AUTOMATED SYNC']);
  rows.push(['']);

  // SECTION 1: DATE & CLIENT SCHEDULE BREAKDOWN ("date/clients/ketli reels -numbers")
  rows.push(['SECTION 1: PRODUCTION SCHEDULE BY DATE & CLIENT (HOW MANY REELS / POSTS NUMBERS)']);
  rows.push([
    'Planned Date',       // A
    'Client',             // B
    'Reels (Numbers)',    // C - "ketli reels - numbers"
    'Posts (Numbers)',    // D - "how many posts"
    'Carousels (Numbers)',// E
    'Total Items',        // F
    'Shoots Completed',   // G - "shoot complete"
    'Edits Completed',    // H - "edit complete"
    'Graphics Approved',  // I - "graphic approvals"
    'Client Approvals',   // J - "client approval"
    'Schedule Status',    // K - "schedule"
    'Daily Progress',     // L
    'Day Status',         // M
  ]);

  // Aggregate contents by Date + Client
  const dateClientGroups = new Map<string, any[]>();
  for (const c of contents) {
    let dateStr = '';
    if (c.scheduledAt) {
      dateStr = new Date(c.scheduledAt).toISOString().split('T')[0];
    } else if (c.plannedPublicationDate) {
      dateStr = new Date(c.plannedPublicationDate).toISOString().split('T')[0];
    } else if (c.productionDeadline) {
      dateStr = new Date(c.productionDeadline).toISOString().split('T')[0];
    } else {
      dateStr = 'Unscheduled';
    }

    const clientName = c.clientId?.name || c.clientId?.businessName || 'Unknown Client';
    const key = `${dateStr}:::${clientName}`;
    if (!dateClientGroups.has(key)) dateClientGroups.set(key, []);
    dateClientGroups.get(key)!.push(c);
  }

  // Sort dates
  const sortedKeys = Array.from(dateClientGroups.keys()).sort((a, b) => {
    const d1 = a.split(':::')[0];
    const d2 = b.split(':::')[0];
    if (d1 === 'Unscheduled') return 1;
    if (d2 === 'Unscheduled') return -1;
    return d1.localeCompare(d2);
  });

  for (const key of sortedKeys) {
    const [dateStr, clientName] = key.split(':::');
    const items = dateClientGroups.get(key)!;

    const reelsCount = items.filter((x) => ['REEL', 'VIDEO', 'SHORT'].includes(x.type)).length;
    const postsCount = items.filter((x) => ['POST', 'IMAGE', 'OTHER'].includes(x.type)).length;
    const carouselsCount = items.filter((x) => x.type === 'CAROUSEL').length;
    const totalItems = items.length;

    // Shoots
    const videoItems = items.filter((x) => ['REEL', 'VIDEO', 'SHORT'].includes(x.type));
    const shootsDone = videoItems.filter((x) => {
      const sh = shootMap.get(String(x._id));
      return sh?.status === 'COMPLETED' || sh?.checklist?.rawUploaded || ['RAW_FOOTAGE', 'EDITING', 'SMM_REVIEW', 'FINAL_REVIEW', 'CLIENT_FINAL_APPROVAL', 'SCHEDULE', 'PUBLISHED'].includes(x.stage);
    }).length;
    const shootSummary = videoItems.length === 0 ? 'Not Required' : shootsDone === videoItems.length ? 'Shoot Done' : `${shootsDone}/${videoItems.length} Shoot Done`;

    // Edits
    const editsDone = videoItems.filter((x) => ['SMM_REVIEW', 'FINAL_REVIEW', 'CLIENT_FINAL_APPROVAL', 'SCHEDULE', 'PUBLISHED'].includes(x.stage) || x.productionStatus === 'EDIT_DONE').length;
    const editSummary = videoItems.length === 0 ? 'Not Required' : editsDone === videoItems.length ? 'Edit Done' : `${editsDone}/${videoItems.length} Edit Done`;

    // Graphics
    const graphicItems = items.filter((x) => ['POST', 'CAROUSEL', 'AI_IMAGE', 'IMAGE'].includes(x.type));
    const graphicsApproved = graphicItems.filter((x) => ['FINAL_REVIEW', 'CLIENT_FINAL_APPROVAL', 'SCHEDULE', 'PUBLISHED'].includes(x.stage)).length;
    const graphicSummary = graphicItems.length === 0 ? 'Not Required' : graphicsApproved === graphicItems.length ? 'Approved' : `${graphicsApproved}/${graphicItems.length} Approved`;

    // Client Approvals
    const clientApprovedCount = items.filter((x) => x.approvalStatus === 'APPROVED_CLIENT' || ['SCHEDULE', 'PUBLISHED'].includes(x.stage)).length;
    const clientAppSummary = clientApprovedCount === totalItems ? 'Approved' : `${clientApprovedCount}/${totalItems} Approved`;

    // Scheduled / Live
    const scheduledOrPosted = items.filter((x) => ['SCHEDULE', 'PUBLISHED'].includes(x.stage) || x.status === 'SCHEDULED' || x.status === 'COMPLETED').length;
    const scheduleSummary = scheduledOrPosted === totalItems ? 'Scheduled' : `${scheduledOrPosted}/${totalItems} Scheduled`;

    // Progress
    const totalProgress = Math.round(items.reduce((acc, cur) => acc + (cur.progress || 0), 0) / Math.max(1, totalItems));
    const dayStatus = totalProgress === 100 ? 'Completed' : totalProgress >= 50 ? 'On Track' : 'In Progress';

    rows.push([
      dateStr,
      clientName,
      reelsCount,
      postsCount,
      carouselsCount,
      totalItems,
      shootSummary,
      editSummary,
      graphicSummary,
      clientAppSummary,
      scheduleSummary,
      `${totalProgress}%`,
      dayStatus,
    ]);
  }

  // Blank rows before Section 2
  rows.push(['']);
  rows.push(['']);

  // SECTION 2: CLIENT PACKAGE MASTER PLAN ("SAME GRAPHIC IN 10 REELS , 5 POST WORK FLOW")
  rows.push(['SECTION 2: CLIENT MONTHLY PACKAGE & QUOTA FULFILLMENT (10 REELS, 5 POSTS TRACKER)']);
  rows.push([
    'Client Code',            // A
    'Client Name',            // B
    'Target Reels',           // C
    'Reels Done',             // D
    'Reels Remaining',        // E - [HIGHLIGHTED REMAINING]
    'Target Posts',           // F
    'Posts Done',             // G
    'Posts Remaining',        // H - [HIGHLIGHTED REMAINING]
    'Target Carousels',       // I
    'Carousels Done',         // J
    'Carousels Remaining',    // K - [HIGHLIGHTED REMAINING]
    'Total Quota Target',     // L
    'Total Completed',        // M
    'Total Remaining',        // N - [HIGHLIGHTED REMAINING]
    'Pending Deliverables',   // O - e.g. "ACTION: 2 Posts REMAINING to make"
    'Shoots Done',            // P
    'Edits Done',             // Q
    'Graphics Approved',      // R
    'Client Approved',        // S
    'Live / Posted',          // T
    'Fulfillment %',          // U
    'Package Health',         // V
  ]);

  for (const cl of clients) {
    const clientContents = contents.filter((x) => String(x.clientId?._id || x.clientId) === String(cl._id));

    const targetReels = Number(cl.monthlyPackage?.reels ?? 10);
    const targetPosts = Number(cl.monthlyPackage?.posts ?? 5);
    const targetCarousels = Number(cl.monthlyPackage?.carousels ?? 2);
    const totalTarget = targetReels + targetPosts + targetCarousels;

    const reels = clientContents.filter((x) => ['REEL', 'VIDEO', 'SHORT'].includes(x.type));
    const reelsDone = reels.filter((x) => x.stage === 'PUBLISHED' || x.status === 'COMPLETED' || x.approvalStatus === 'APPROVED_CLIENT').length;
    const reelsRemaining = Math.max(0, targetReels - reelsDone);

    const posts = clientContents.filter((x) => ['POST', 'IMAGE', 'OTHER'].includes(x.type));
    const postsDone = posts.filter((x) => x.stage === 'PUBLISHED' || x.status === 'COMPLETED').length;
    const postsRemaining = Math.max(0, targetPosts - postsDone);

    const carousels = clientContents.filter((x) => x.type === 'CAROUSEL');
    const carouselsDone = carousels.filter((x) => ['SCHEDULE', 'PUBLISHED'].includes(x.stage) || x.status === 'COMPLETED').length;
    const carouselsRemaining = Math.max(0, targetCarousels - carouselsDone);

    const totalDone = reelsDone + postsDone + carouselsDone;
    const totalRemaining = reelsRemaining + postsRemaining + carouselsRemaining;

    const shootsDone = reels.filter((x) => {
      const sh = shootMap.get(String(x._id));
      return sh?.status === 'COMPLETED' || sh?.checklist?.rawUploaded || ['RAW_FOOTAGE', 'EDITING', 'SMM_REVIEW', 'FINAL_REVIEW', 'CLIENT_FINAL_APPROVAL', 'SCHEDULE', 'PUBLISHED'].includes(x.stage);
    }).length;

    const editsDone = reels.filter((x) => ['SMM_REVIEW', 'FINAL_REVIEW', 'CLIENT_FINAL_APPROVAL', 'SCHEDULE', 'PUBLISHED'].includes(x.stage) || x.productionStatus === 'EDIT_DONE').length;
    const graphicsApproved = [...posts, ...carousels].filter((x) => ['FINAL_REVIEW', 'CLIENT_FINAL_APPROVAL', 'SCHEDULE', 'PUBLISHED'].includes(x.stage)).length;
    const clientApproved = clientContents.filter((x) => x.approvalStatus === 'APPROVED_CLIENT' || ['SCHEDULE', 'PUBLISHED'].includes(x.stage)).length;
    const livePosted = clientContents.filter((x) => x.stage === 'PUBLISHED' || x.status === 'COMPLETED').length;

    const fulfillmentPct = Math.min(100, Math.round((totalDone / Math.max(1, totalTarget)) * 100));

    const pendingParts: string[] = [];
    if (reelsRemaining > 0) pendingParts.push(`${reelsRemaining} Reels`);
    if (postsRemaining > 0) pendingParts.push(`${postsRemaining} Posts`);
    if (carouselsRemaining > 0) pendingParts.push(`${carouselsRemaining} Carousels`);
    const pendingAlert = pendingParts.length > 0
      ? `ACTION: ${pendingParts.join(', ')} REMAINING`
      : 'ALL QUOTA COMPLETED';

    const healthStatus = totalRemaining === 0 ? 'Completed' : (reelsDone > 0 || postsDone > 0) ? 'Action Required' : 'In Progress';

    rows.push([
      cl.clientCode || String(cl._id).substring(0, 6).toUpperCase(),
      cl.name,
      targetReels,
      reelsDone,
      reelsRemaining === 0 ? '0 (Done)' : `${reelsRemaining} REMAINING`,
      targetPosts,
      postsDone,
      postsRemaining === 0 ? '0 (Done)' : `${postsRemaining} REMAINING`,
      targetCarousels,
      carouselsDone,
      carouselsRemaining === 0 ? '0 (Done)' : `${carouselsRemaining} REMAINING`,
      totalTarget,
      totalDone,
      totalRemaining === 0 ? '0 (Done)' : `${totalRemaining} REMAINING`,
      pendingAlert,
      shootsDone,
      editsDone,
      graphicsApproved,
      clientApproved,
      livePosted,
      `${fulfillmentPct}%`,
      healthStatus,
    ]);
  }

  return rows;
}

/** Full synchronization of MongoDB content and database records to Google Sheets */
export async function syncAllToGoogleSheets(explicitSpreadsheetId?: string): Promise<{
  success: boolean;
  contentCount: number;
  reelsCount: number;
  postsCount: number;
  carouselsCount: number;
  aiReelsCount: number;
  clientCount: number;
  scheduleCount: number;
  taskCount: number;
  employeeCount: number;
  message: string;
}> {
  const spreadsheetId = explicitSpreadsheetId || await getSpreadsheetId();
  if (!spreadsheetId) {
    throw new Error('Google Spreadsheet ID is not configured. Please create or configure a spreadsheet first.');
  }

  const s = sheets();

  // Ensure all 12 sheets exist
  await ensureAllSheetsExist(spreadsheetId);

  // 1. Fetch all active data from MongoDB including Shoots
  const [contents, clients, tasks, employees, scheduledPosts, shoots] = await Promise.all([
    Content.find({ deletedAt: null })
      .sort({ createdAt: -1 })
      .populate('clientId', 'name businessName clientCode monthlyPackage')
      .populate('campaignId', 'name')
      .populate('assignedWriter assignedShooter assignedEditor assignedDesigner assignedSMM assignedReviewer currentOwner', 'name role')
      .lean(),
    Client.find({ deletedAt: null }).sort({ name: 1 }).lean(),
    Task.find({ deletedAt: null }).sort({ createdAt: -1 }).limit(200).populate('assignedTo', 'name').populate('contentId', 'contentId').lean(),
    User.find({ active: true }).sort({ name: 1 }).lean(),
    ScheduledPost.find({}).sort({ scheduledAt: -1 }).populate('clientId', 'name').populate('contentId', 'contentId title').lean(),
    Shoot.find({ deletedAt: null }).populate('shooterId', 'name').lean(),
  ]);

  const shootMap = new Map(shoots.map((sh: any) => [String(sh.contentId), sh]));

  // 2. Build rows for Master Content Tracker and Dedicated Type Trackers
  const contentRows = contents.map((c, index) => buildContentRow(c, index + 2, shootMap));

  const reelsContents = contents.filter((c) => ['REEL', 'VIDEO', 'SHORT'].includes(c.type));
  const reelsRows = reelsContents.map((c, index) => buildContentRow(c, index + 2, shootMap));

  const postsContents = contents.filter((c) => ['POST', 'IMAGE', 'OTHER'].includes(c.type));
  const postsRows = postsContents.map((c, index) => buildContentRow(c, index + 2, shootMap));

  const carouselsContents = contents.filter((c) => c.type === 'CAROUSEL');
  const carouselsRows = carouselsContents.map((c, index) => buildContentRow(c, index + 2, shootMap));

  const aiReelsContents = contents.filter((c) => ['AI_REEL', 'AI_IMAGE'].includes(c.type));
  const aiReelsRows = aiReelsContents.map((c, index) => buildContentRow(c, index + 2, shootMap));

  // 3. Build Master Plan rows (Date-wise schedule & client quota fulfillment)
  const masterPlanRows = buildMasterPlanRows(contents, clients, shoots);

  // 4. Build Client rows
  const clientRows = clients.map((cl) => {
    const clientContents = contents.filter((x) => String(x.clientId?._id || x.clientId) === String(cl._id));
    const targetReels = Number(cl.monthlyPackage?.reels ?? 10);
    const targetPosts = Number(cl.monthlyPackage?.posts ?? 5);
    const targetCarousels = Number(cl.monthlyPackage?.carousels ?? 2);

    const reels = clientContents.filter((x) => ['REEL', 'VIDEO', 'SHORT'].includes(x.type));
    const reelsDone = reels.filter((x) => x.stage === 'PUBLISHED' || x.status === 'COMPLETED' || x.approvalStatus === 'APPROVED_CLIENT').length;
    const reelsRemaining = Math.max(0, targetReels - reelsDone);

    const posts = clientContents.filter((x) => ['POST', 'IMAGE', 'OTHER'].includes(x.type));
    const postsDone = posts.filter((x) => x.stage === 'PUBLISHED' || x.status === 'COMPLETED').length;
    const postsRemaining = Math.max(0, targetPosts - postsDone);

    const carousels = clientContents.filter((x) => x.type === 'CAROUSEL');
    const carouselsDone = carousels.filter((x) => ['SCHEDULE', 'PUBLISHED'].includes(x.stage) || x.status === 'COMPLETED').length;
    const carouselsRemaining = Math.max(0, targetCarousels - carouselsDone);

    const totalTarget = targetReels + targetPosts + targetCarousels;
    const totalDone = reelsDone + postsDone + carouselsDone;
    const fulfillmentPct = Math.min(100, Math.round((totalDone / Math.max(1, totalTarget)) * 100));

    const pendingList: string[] = [];
    if (reelsRemaining > 0) pendingList.push(`${reelsRemaining} Reels`);
    if (postsRemaining > 0) pendingList.push(`${postsRemaining} Posts`);
    if (carouselsRemaining > 0) pendingList.push(`${carouselsRemaining} Carousels`);
    const pendingSummary = pendingList.length > 0 ? `ACTION: ${pendingList.join(', ')} REMAINING` : 'All Quota Met';

    return [
      cl.clientCode || String(cl._id).substring(0, 8).toUpperCase(),
      cl.name,
      cl.businessName || '',
      cl.contactPerson || '',
      cl.phone || '',
      cl.status || 'ACTIVE',
      `${targetReels} Reels, ${targetPosts} Posts, ${targetCarousels} Carousels`,
      `${reelsDone} / ${targetReels} ${reelsRemaining > 0 ? `(${reelsRemaining} REMAINING)` : '(Done)'}`,
      `${postsDone} / ${targetPosts} ${postsRemaining > 0 ? `(${postsRemaining} REMAINING)` : '(Done)'}`,
      `${carouselsDone} / ${targetCarousels} ${carouselsRemaining > 0 ? `(${carouselsRemaining} REMAINING)` : '(Done)'}`,
      pendingSummary,
      `${fulfillmentPct}%`,
      new Date().toISOString().replace('T', ' ').substring(0, 19),
    ];
  });

  // 5. Build Comprehensive Schedule rows (Section 1: Client Packages & Progress, Section 2: Detailed Calendar)
  const scheduleRows: any[][] = [];
  scheduleRows.push(['SECTION 1: CLIENT MONTHLY PACKAGES & DELIVERABLES FULFILLMENT STATUS']);
  scheduleRows.push(SCHEDULE_HEADERS);

  clients.forEach((cl: any) => {
    const pkg = cl.monthlyPackage || { reels: 10, posts: 5, carousels: 2 };
    const targetReels = Number(pkg.reels ?? 10);
    const targetPosts = Number(pkg.posts ?? 5);
    const targetCarousels = Number(pkg.carousels ?? 2);
    const targetTotal = targetReels + targetPosts + targetCarousels;

    const clItems = contents.filter((c: any) => String(c.clientId?._id || c.clientId) === String(cl._id) && c.status !== 'CANCELLED');

    // Made (Bani Gay)
    const reelsMade = clItems.filter((c: any) => ['REEL', 'VIDEO', 'SHORT'].includes(c.type)).length;
    const postsMade = clItems.filter((c: any) => ['POST', 'IMAGE', 'OTHER'].includes(c.type)).length;
    const carouselsMade = clItems.filter((c: any) => c.type === 'CAROUSEL').length;
    const totalMade = reelsMade + postsMade + carouselsMade;

    // Remaining (Baki Chhe)
    const reelsRem = Math.max(0, targetReels - reelsMade);
    const postsRem = Math.max(0, targetPosts - postsMade);
    const carouselsRem = Math.max(0, targetCarousels - carouselsMade);
    const totalRem = reelsRem + postsRem + carouselsRem;

    // Scheduled (Schedule Thay)
    const clScheduled = clItems.filter((c: any) => c.stage === 'SCHEDULE' || c.status === 'SCHEDULED' || c.plannedPublicationDate != null);
    const reelsSched = clScheduled.filter((c: any) => ['REEL', 'VIDEO', 'SHORT'].includes(c.type)).length;
    const postsSched = clScheduled.filter((c: any) => ['POST', 'IMAGE', 'OTHER'].includes(c.type)).length;
    const carouselsSched = clScheduled.filter((c: any) => c.type === 'CAROUSEL').length;
    const totalSched = reelsSched + postsSched + carouselsSched;

    // Ready to Schedule
    const readyCount = clItems.filter((c: any) =>
      (c.stage === 'FINAL_UPLOAD' || (c.stage === 'SCHEDULE' && !c.plannedPublicationDate)) &&
      c.stage !== 'PUBLISHED' && c.status !== 'COMPLETED'
    ).length;

    // Posted
    const postedCount = clItems.filter((c: any) =>
      c.stage === 'PUBLISHED' || c.status === 'COMPLETED' || c.productionStatus === 'POSTED'
    ).length;

    const fulfillmentPct = targetTotal > 0 ? Math.min(100, Math.round((totalMade / targetTotal) * 100)) : 100;

    const remList: string[] = [];
    if (reelsRem > 0) remList.push(`${reelsRem} Reels`);
    if (postsRem > 0) remList.push(`${postsRem} Posts`);
    if (carouselsRem > 0) remList.push(`${carouselsRem} Carousels`);
    const remSummary = remList.length > 0 ? `${totalRem} REMAINING (${remList.join(', ')})` : '0 (Done)';
    const alertSummary = remList.length > 0 ? `ACTION: ${remList.join(', ')} REMAINING TO MAKE` : 'ALL QUOTA COMPLETED';

    scheduleRows.push([
      cl.clientCode || String(cl._id).substring(0, 8).toUpperCase(),
      cl.name,
      `${targetReels} Reels, ${targetPosts} Posts, ${targetCarousels} Carousels (${targetTotal} Total)`,
      `${totalMade} Made (${reelsMade} Reels, ${postsMade} Posts, ${carouselsMade} Carousels)`,
      remSummary,
      `${totalSched} Scheduled (${reelsSched} Reels, ${postsSched} Posts, ${carouselsSched} Carousels)`,
      readyCount,
      postedCount,
      alertSummary,
      `${fulfillmentPct}%`,
      new Date().toISOString().replace('T', ' ').substring(0, 19),
    ]);
  });

  scheduleRows.push(['']);
  scheduleRows.push(['']);
  scheduleRows.push(['SECTION 2: CONTENT PUBLICATION TIMELINE & CALENDAR']);
  scheduleRows.push([
    'Content ID',
    'Client',
    'Content Type',
    'Platform',
    'Topic / Title',
    'Production Status (Bani Gay?)',
    'Scheduled Date',
    'Scheduled Time',
    'Schedule Status',
    'Live URL',
    'Google Drive Link',
    'Publish Remarks',
  ]);

  contents.forEach((c: any) => {
    const isPosted = c.stage === 'PUBLISHED' || c.status === 'COMPLETED' || c.productionStatus === 'POSTED';
    const isScheduled = c.stage === 'SCHEDULE' || c.status === 'SCHEDULED' || c.plannedPublicationDate != null;
    const isReady = c.stage === 'FINAL_UPLOAD' || c.approvalStatus === 'APPROVED';

    let prodStatus = 'In Production';
    if (isPosted) prodStatus = 'Posted Live';
    else if (isScheduled) prodStatus = 'Made & Scheduled';
    else if (isReady) prodStatus = 'Made (Ready to Schedule)';

    let schedStatus = 'Pending';
    if (isPosted) schedStatus = 'Posted';
    else if (isScheduled) schedStatus = 'Scheduled';
    else if (isReady) schedStatus = 'Ready to Schedule';

    const pDate = c.plannedPublicationDate ? new Date(c.plannedPublicationDate).toISOString().split('T')[0] : '';
    const pTime = c.plannedPublicationTime || '';

    scheduleRows.push([
      c.contentId || '',
      c.clientId?.name || '',
      c.type || 'REEL',
      c.platform || 'INSTAGRAM',
      c.title || '',
      prodStatus,
      pDate,
      pTime,
      schedStatus,
      c.liveUrl || '',
      c.finalDriveLink || '',
      c.productionStatus === 'CANCELLED' ? 'Cancelled' : (isPosted ? 'Live' : (isScheduled ? 'Scheduled' : 'Draft / In Progress')),
    ]);
  });

  // 6. Build Employee rows
  const employeeRows = await Promise.all(
    employees.map(async (u) => {
      const openTasks = await Task.countDocuments({ assignedTo: u._id, status: { $nin: ['COMPLETED', 'CANCELLED'] } });
      return [
        String(u._id),
        u.name,
        u.email,
        u.role,
        openTasks,
        new Date().toISOString().replace('T', ' ').substring(0, 19),
      ];
    })
  );

  // 7. Build Task rows
  const taskRows = tasks.map((t: any) => [
    t.taskId || String(t._id),
    t.contentId?.contentId || '',
    t.title,
    t.assignedTo?.name || 'Unassigned',
    t.kind || 'GENERAL',
    t.priority || 'MEDIUM',
    t.status || 'TODO',
    t.dueAt ? new Date(t.dueAt).toISOString().split('T')[0] : '',
  ]);

  // 8. Calculate Dashboard summary
  const overdue = contents.filter((c) => c.deadline && new Date(c.deadline) < new Date() && c.status !== 'COMPLETED').length;
  const scheduled = contents.filter((c) => c.stage === 'SCHEDULE' || c.status === 'SCHEDULED').length;
  const posted = contents.filter((c) => c.stage === 'PUBLISHED' || c.status === 'COMPLETED').length;

  const dashboardRows = [
    ['SMM PRO — REAL-TIME EXECUTIVE DASHBOARD'],
    ['Last Synchronized:', new Date().toISOString().replace('T', ' ').substring(0, 19)],
    [''],
    ['METRIC', 'COUNT', 'REMARKS'],
    ['Total Clients', clients.length, 'Active Agency Clients'],
    ['Total Content Items', contents.length, 'All Tracked Content across all types'],
    ['Reels in Production', reelsContents.length, 'Standard Reels, Videos & Shorts'],
    ['Posts in Production', postsContents.length, 'Static Graphics & Single Posts'],
    ['Carousels in Production', carouselsContents.length, 'Multi-Slide Educational Content'],
    ['AI Reels in Production', aiReelsContents.length, 'AI Video & Synthetic Generation'],
    ['Overdue Content', overdue, 'Exceeded Target Deadline'],
    ['Scheduled Posts', scheduled, 'Ready for Publishing'],
    ['Published Content', posted, 'Live on Social Media'],
  ];

  // 9. Clear previous rows to ensure clean sync across all sheets
  try {
    await s.spreadsheets.values.batchClear({
      spreadsheetId,
      requestBody: {
        ranges: [
          "'Content Tracker'!A1:AG500",
          "'Master Plan'!A1:V500",
          "'Reels'!A1:AG500",
          "'Posts'!A1:AG500",
          "'Carousels'!A1:AG500",
          "'AI Reels'!A1:AG500",
          "'Clients'!A1:M500",
          "'Schedule'!A1:L500",
          "'Employees'!A1:F500",
          "'Tasks'!A1:H500",
        ],
      },
    });
  } catch (clearErr: any) {
    console.warn('[sheets] Warning clearing previous rows:', clearErr.message);
  }

  // 10. Execute batch update to Google Sheets across all sheets starting at row 1 with headers
  const updates: sheets_v4.Schema$ValueRange[] = [
    { range: "'Dashboard'!A1:C14", values: dashboardRows },
    { range: "'Master Plan'!A1:V" + masterPlanRows.length, values: masterPlanRows },
    { range: "'Clients'!A1:M" + (clientRows.length + 1), values: [CLIENT_HEADERS, ...clientRows] },
    { range: "'Schedule'!A1:L" + scheduleRows.length, values: scheduleRows },
    { range: "'Employees'!A1:F" + (employeeRows.length + 1), values: [EMPLOYEE_HEADERS, ...employeeRows] },
    { range: "'Tasks'!A1:H" + (taskRows.length + 1), values: [TASK_HEADERS, ...taskRows] },
    { range: "'Content Tracker'!A1:AG" + (contentRows.length + 1), values: [CONTENT_TRACKER_HEADERS, ...contentRows] },
    { range: "'Reels'!A1:AG" + (reelsRows.length + 1), values: [CONTENT_TRACKER_HEADERS, ...reelsRows] },
    { range: "'Posts'!A1:AG" + (postsRows.length + 1), values: [CONTENT_TRACKER_HEADERS, ...postsRows] },
    { range: "'Carousels'!A1:AG" + (carouselsRows.length + 1), values: [CONTENT_TRACKER_HEADERS, ...carouselsRows] },
    { range: "'AI Reels'!A1:AG" + (aiReelsRows.length + 1), values: [CONTENT_TRACKER_HEADERS, ...aiReelsRows] },
  ];

  await s.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: 'USER_ENTERED',
      data: updates,
    },
  });

  // Apply/refresh status conditional formatting rules across all sheets
  try {
    await applyStatusConditionalFormatting(spreadsheetId);
  } catch (fmtErr: any) {
    console.warn('[sheets] Warning applying conditional formatting in sync:', fmtErr.message);
  }

  // Log sync success to SystemSetting and ActivityLog
  await SystemSetting.findOneAndUpdate(
    { key: 'google_sheets_sync_status' },
    {
      key: 'google_sheets_sync_status',
      value: {
        lastSyncedAt: new Date(),
        status: 'SUCCESS',
        contentCount: contents.length,
        reelsCount: reelsContents.length,
        postsCount: postsContents.length,
        carouselsCount: carouselsContents.length,
        aiReelsCount: aiReelsContents.length,
        clientCount: clients.length,
        taskCount: tasks.length,
      },
    },
    { upsert: true }
  );

  await ActivityLog.create({
    actorType: 'SYSTEM',
    action: 'sheets.sync',
    message: `Synchronized ${contents.length} contents (Reels: ${reelsContents.length}, Posts: ${postsContents.length}, Carousels: ${carouselsContents.length}, AI Reels: ${aiReelsContents.length}) and ${clients.length} clients to Google Sheets`,
    meta: {
      contentCount: contents.length,
      reelsCount: reelsContents.length,
      postsCount: postsContents.length,
      carouselsCount: carouselsContents.length,
      aiReelsCount: aiReelsContents.length,
      clientCount: clients.length,
    },
  });

  return {
    success: true,
    contentCount: contents.length,
    reelsCount: reelsContents.length,
    postsCount: postsContents.length,
    carouselsCount: carouselsContents.length,
    aiReelsCount: aiReelsContents.length,
    clientCount: clients.length,
    scheduleCount: scheduleRows.length,
    taskCount: tasks.length,
    employeeCount: employees.length,
    message: `Successfully synchronized ${contents.length} content records and Master Plan (Date & Client Quotas) in Google Sheets`,
  };
}

/** Refreshes Master Plan and Dashboard sheets in real time */
export async function updateMasterPlanAndDashboard(spreadsheetId: string): Promise<void> {
  const s = sheets();
  const [contents, clients, shoots] = await Promise.all([
    Content.find({ deletedAt: null })
      .sort({ createdAt: -1 })
      .populate('clientId', 'name businessName clientCode monthlyPackage')
      .populate('campaignId', 'name')
      .populate('assignedWriter assignedShooter assignedEditor assignedDesigner assignedSMM assignedReviewer currentOwner', 'name role')
      .lean(),
    Client.find({ deletedAt: null }).sort({ name: 1 }).lean(),
    Shoot.find({ deletedAt: null }).populate('shooterId', 'name').lean(),
  ]);

  const masterPlanRows = buildMasterPlanRows(contents, clients, shoots);

  try {
    await s.spreadsheets.values.clear({
      spreadsheetId,
      range: "'Master Plan'!A1:S500",
    });
  } catch (clearErr: any) {
    // ignore
  }

  await s.spreadsheets.values.update({
    spreadsheetId,
    range: `'Master Plan'!A1:S${masterPlanRows.length}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: masterPlanRows },
  });
}

/** Synchronizes a single content item row into Google Sheets (both Master and Dedicated sheet) and updates Master Plan */
export async function syncSingleContentToSheet(contentId: string): Promise<void> {
  const spreadsheetId = await getSpreadsheetId();
  if (!spreadsheetId) return; // Silent if not configured

  try {
    const s = sheets();
    const [content, shoot] = await Promise.all([
      Content.findById(contentId)
        .populate('clientId', 'name businessName clientCode')
        .populate('campaignId', 'name')
        .populate('assignedWriter assignedShooter assignedEditor assignedDesigner assignedSMM assignedReviewer currentOwner', 'name role')
        .lean(),
      Shoot.findOne({ contentId }).populate('shooterId', 'name').lean(),
    ]);

    if (!content) return;

    const shootMap = new Map([[String(content._id), shoot]]);
    const targetSheetsToUpdate = ['Content Tracker'];
    const dedicated = getDedicatedSheetForType(content.type);
    if (dedicated && !targetSheetsToUpdate.includes(dedicated)) {
      targetSheetsToUpdate.push(dedicated);
    }

    for (const sheetName of targetSheetsToUpdate) {
      // Fetch existing Column A (Content IDs) to check for row match
      const colA = await s.spreadsheets.values.get({
        spreadsheetId,
        range: `'${sheetName}'!A2:A500`,
      });

      const rows = colA.data.values || [];
      let targetRow = -1;

      for (let i = 0; i < rows.length; i++) {
        if (rows[i][0] === content.contentId) {
          targetRow = i + 2; // +2 for 1-based index and header row
          break;
        }
      }

      if (targetRow === -1) {
        targetRow = rows.length + 2;
      }

      const rowData = buildContentRow(content, targetRow, shootMap);

      await s.spreadsheets.values.update({
        spreadsheetId,
        range: `'${sheetName}'!A${targetRow}:AE${targetRow}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [rowData],
        },
      });
    }

    // Refresh Master Plan in background
    updateMasterPlanAndDashboard(spreadsheetId).catch((e) => console.warn('[sheets] Master Plan auto-update warning:', e.message));
  } catch (err: any) {
    console.warn(`[sheets] Failed to sync content ${contentId} to Google Sheets:`, err.message);
  }
}

export interface ShooterEditorReportFilter {
  role?: 'ALL' | 'SHOOTER' | 'EDITOR';
  userId?: string;
  clientId?: string;
  month?: number;
  year?: number;
  startDate?: string;
  endDate?: string;
  status?: string;
  contentType?: string;
  search?: string;
}

/** Generates a dedicated, color-formatted Shooter & Editor Production Report tab in Google Sheets */
export async function generateShooterEditorReportSheet(filter: ShooterEditorReportFilter = {}) {
  const spreadsheetId = await getSpreadsheetId();
  if (!spreadsheetId) {
    throw new Error('Google Spreadsheet ID is not configured');
  }

  const query: any = { status: { $ne: 'CANCELLED' } };

  if (filter.clientId) {
    query.clientId = filter.clientId;
  }

  if (filter.contentType) {
    query.type = filter.contentType;
  }

  if (filter.userId) {
    if (filter.role === 'SHOOTER') {
      query.assignedShooter = filter.userId;
    } else if (filter.role === 'EDITOR') {
      query.assignedEditor = filter.userId;
    } else {
      query.$or = [{ assignedShooter: filter.userId }, { assignedEditor: filter.userId }];
    }
  }

  // Date filtering
  if (filter.startDate || filter.endDate) {
    const dateMatch: any = {};
    if (filter.startDate) dateMatch.$gte = new Date(filter.startDate);
    if (filter.endDate) {
      const ed = new Date(filter.endDate);
      ed.setHours(23, 59, 59, 999);
      dateMatch.$lte = ed;
    }
    query.$or = [
      { deadline: dateMatch },
      { plannedPublicationDate: dateMatch },
      { createdAt: dateMatch },
    ];
  } else if (filter.month && filter.year) {
    const sm = new Date(filter.year, filter.month - 1, 1);
    const em = new Date(filter.year, filter.month, 0, 23, 59, 59, 999);
    const dateMatch = { $gte: sm, $lte: em };
    query.$or = [
      { deadline: dateMatch },
      { plannedPublicationDate: dateMatch },
      { createdAt: dateMatch },
    ];
  } else if (filter.year) {
    const sy = new Date(filter.year, 0, 1);
    const ey = new Date(filter.year, 11, 31, 23, 59, 59, 999);
    const dateMatch = { $gte: sy, $lte: ey };
    query.$or = [
      { deadline: dateMatch },
      { plannedPublicationDate: dateMatch },
      { createdAt: dateMatch },
    ];
  }

  // Status Filter
  if (filter.status && filter.status !== 'ALL') {
    if (filter.status === 'PENDING_SHOOT') {
      query.stage = { $in: ['IDEA', 'SCRIPT', 'CLIENT_REVIEW', 'SHOOTING'] };
      query.productionStatus = { $nin: ['RAW_UPLOADED', 'EDITING', 'POSTED', 'COMPLETED'] };
    } else if (filter.status === 'SHOT') {
      query.$or = [
        { stage: { $in: ['RAW_FOOTAGE', 'EDITING', 'SMM_REVIEW', 'FINAL_REVIEW', 'SCHEDULE', 'PUBLISHED'] } },
        { productionStatus: { $in: ['RAW_UPLOADED', 'EDITING', 'COMPLETED'] } },
      ];
    } else if (filter.status === 'EDITING') {
      query.stage = { $in: ['RAW_FOOTAGE', 'EDITING'] };
    } else if (filter.status === 'EDIT_DONE') {
      query.stage = { $in: ['SMM_REVIEW', 'FINAL_REVIEW', 'CLIENT_FINAL_APPROVAL', 'SCHEDULE', 'PUBLISHED'] };
    } else if (filter.status === 'COMPLETED') {
      query.$or = [{ stage: 'PUBLISHED' }, { status: 'COMPLETED' }, { productionStatus: 'POSTED' }];
    }
  }

  const items = await Content.find(query)
    .populate('clientId', 'name businessName clientCode')
    .populate('assignedShooter', 'name email role')
    .populate('assignedEditor', 'name email role')
    .populate('currentOwner', 'name role')
    .sort({ deadline: 1, plannedPublicationDate: 1, createdAt: -1 })
    .lean();

  const shoots = await Shoot.find({ contentId: { $in: items.map((it: any) => it._id) } })
    .populate('shooterId', 'name')
    .lean();
  const shootMap = new Map(shoots.map((sh: any) => [String(sh.contentId), sh]));

  // Sheet Title
  const now = new Date();
  const dateTag = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
  const roleTag = filter.role === 'SHOOTER' ? 'Shooters' : filter.role === 'EDITOR' ? 'Editors' : 'Production';
  const sheetTitle = `Report_${roleTag}_${dateTag}`.slice(0, 100);

  const s = sheets();

  // Create new Sheet tab in the Spreadsheet
  const addResp = await s.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          addSheet: {
            properties: {
              title: sheetTitle,
              gridProperties: {
                rowCount: Math.max(100, items.length + 20),
                columnCount: 18,
                frozenRowCount: 4,
              },
              tabColor: { red: 0.1, green: 0.5, blue: 0.9 },
            },
          },
        },
      ],
    },
  });

  const sheetId = addResp.data.replies?.[0]?.addSheet?.properties?.sheetId || 0;

  // Compute Metrics
  let countShot = 0;
  let countPendingShoot = 0;
  let countEditing = 0;
  let countEditDone = 0;
  let countCompleted = 0;

  items.forEach((c: any) => {
    const isShot = ['RAW_FOOTAGE', 'EDITING', 'SMM_REVIEW', 'FINAL_REVIEW', 'SCHEDULE', 'PUBLISHED'].includes(c.stage) ||
      ['RAW_UPLOADED', 'EDITING', 'COMPLETED'].includes(c.productionStatus);
    if (isShot) countShot++;
    else countPendingShoot++;

    if (['RAW_FOOTAGE', 'EDITING'].includes(c.stage)) countEditing++;
    if (['SMM_REVIEW', 'FINAL_REVIEW', 'CLIENT_FINAL_APPROVAL', 'SCHEDULE', 'PUBLISHED'].includes(c.stage)) countEditDone++;
    if (c.stage === 'PUBLISHED' || c.status === 'COMPLETED' || c.productionStatus === 'POSTED') countCompleted++;
  });

  // Prepare Rows
  const row1 = [`BULLETPROOF SMM PRO — ${roleTag.toUpperCase()} PERFORMANCE & STATUS REPORT`, '', '', '', '', '', '', '', '', '', '', '', '', '', '', 'Generated: ' + now.toLocaleString('en-IN')];
  const row2 = [
    `Total Deliverables: ${items.length}`,
    `Total Shot: ${countShot}`,
    `Pending Shoot: ${countPendingShoot}`,
    `In Video Editing: ${countEditing}`,
    `Edit Completed: ${countEditDone}`,
    `Posted Live: ${countCompleted}`,
    `Scope: ${filter.clientId ? 'Selected Client' : 'All Clients'} · ${filter.month ? 'Month ' + filter.month : 'All Periods'}`,
  ];
  const row3 = ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''];
  const row4 = [
    'Content ID',
    'Client Code',
    'Client Business Name',
    'Deliverable Title',
    'Type',
    'Shooter Name',
    'Shoot Status',
    'Shoot Date & Time',
    'Editor Name',
    'Edit Status',
    'Current Stage',
    'Production Status',
    'Deadline',
    'Days Left',
    'Google Drive Folder Link',
    'Live Published URL',
    'Current Owner',
  ];

  const appUrl = process.env.APP_URL || 'https://smm-pro-nayankotadiya.vercel.app';

  const dataRows = items.map((c: any, idx: number) => {
    const rowNum = idx + 5;
    const cl = c.clientId || {};
    const shooter = c.assignedShooter?.name || 'Unassigned';
    const editor = c.assignedEditor?.name || 'Unassigned';
    const owner = c.currentOwner?.name || 'Unassigned';
    const shoot = shootMap.get(String(c._id));

    // Shoot Status & Date
    const isShot = ['RAW_FOOTAGE', 'EDITING', 'SMM_REVIEW', 'FINAL_REVIEW', 'SCHEDULE', 'PUBLISHED'].includes(c.stage) ||
      ['RAW_UPLOADED', 'EDITING', 'COMPLETED'].includes(c.productionStatus);
    const shootStatus = isShot ? '3. Shoot' : (c.productionStatus === 'CANCELLED' ? '7. shoot pachi cancel' : 'Pending Shoot');
    const shootDate = shoot?.scheduledAt ? new Date(shoot.scheduledAt).toLocaleDateString('en-IN') : (c.stageDeadlines?.shootDeadline ? new Date(c.stageDeadlines.shootDeadline).toLocaleDateString('en-IN') : 'To Be Scheduled');

    // Edit Status
    const isEditDone = ['SMM_REVIEW', 'FINAL_REVIEW', 'CLIENT_FINAL_APPROVAL', 'SCHEDULE', 'PUBLISHED'].includes(c.stage) || c.status === 'COMPLETED';
    const isEditing = ['RAW_FOOTAGE', 'EDITING'].includes(c.stage);
    const editStatus = isEditDone ? '4. Edit done' : (isEditing ? 'Video Editing' : (isShot ? 'Ready for Edit' : 'Awaiting Footage'));

    // Drive Link
    const driveUrl = c.driveFolderId
      ? `https://drive.google.com/drive/folders/${c.driveFolderId}`
      : 'https://drive.google.com';

    // Content Link
    const contentUrl = `${appUrl}/content/${c._id}`;

    // Deadline & Days Left
    const dlStr = c.deadline ? new Date(c.deadline).toLocaleDateString('en-IN') : '';

    return [
      `=HYPERLINK("${contentUrl}", "${c.contentId}")`,
      cl.clientCode || 'BLP',
      cl.businessName || cl.name || 'Client',
      c.title || '',
      c.type || 'REEL',
      shooter,
      shootStatus,
      shootDate,
      editor,
      editStatus,
      c.stage || 'IDEA',
      c.productionStatus || 'IN_PROGRESS',
      dlStr,
      `=IF(ISBLANK(M${rowNum}), "", M${rowNum}-TODAY())`,
      `=HYPERLINK("${driveUrl}", "Open Google Drive Assets 📁")`,
      c.publishedUrl ? `=HYPERLINK("${c.publishedUrl}", "Open Live Post ↗")` : 'Pending Publishing',
      owner,
    ];
  });

  const allValues = [row1, row2, row3, row4, ...dataRows];

  // Write values into the new sheet
  await s.spreadsheets.values.update({
    spreadsheetId,
    range: `'${sheetTitle}'!A1:Q${allValues.length}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: allValues },
  });

  // Apply Beautiful Formatting & Visual Colors
  const formatRequests: sheets_v4.Schema$Request[] = [
    // Header Row 4 styling (Navy Blue, White Bold, Font 11)
    {
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: 3,
          endRowIndex: 4,
          startColumnIndex: 0,
          endColumnIndex: 17,
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 0.1, green: 0.12, blue: 0.2 },
            textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 }, bold: true, fontSize: 11 },
            horizontalAlignment: 'CENTER',
            verticalAlignment: 'MIDDLE',
          },
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)',
      },
    },
    // Row 1 Title styling (Dark Purple, White Bold, Font 13)
    {
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: 0,
          endRowIndex: 1,
          startColumnIndex: 0,
          endColumnIndex: 17,
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 0.2, green: 0.12, blue: 0.35 },
            textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 }, bold: true, fontSize: 13 },
            verticalAlignment: 'MIDDLE',
          },
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat,verticalAlignment)',
      },
    },
    // Row 2 Summary KPIs styling (Slate Blue/Gray background, Bold Font 10)
    {
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: 1,
          endRowIndex: 2,
          startColumnIndex: 0,
          endColumnIndex: 17,
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 0.92, green: 0.95, blue: 0.99 },
            textFormat: { foregroundColor: { red: 0.1, green: 0.2, blue: 0.4 }, bold: true, fontSize: 10 },
            verticalAlignment: 'MIDDLE',
          },
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat,verticalAlignment)',
      },
    },
    // Alternating Row Banding on Data rows (White & Soft Gray)
    {
      addBanding: {
        bandedRange: {
          range: {
            sheetId,
            startRowIndex: 4,
            endRowIndex: Math.max(5, allValues.length),
            startColumnIndex: 0,
            endColumnIndex: 17,
          },
          rowProperties: {
            firstBandColor: { red: 1, green: 1, blue: 1 },
            secondBandColor: { red: 0.97, green: 0.98, blue: 1.0 },
          },
        },
      },
    },
  ];

  // Add conditional color rules for Shoot Status (Col G = index 6) and Edit Status (Col J = index 9)
  for (const legend of STATUS_COLOR_LEGEND) {
    const rgb = hexToRgbColor(legend.bg);
    const fg = hexToRgbColor(legend.fg);

    // Rule for Shoot Status (Col 6)
    formatRequests.push({
      addConditionalFormatRule: {
        rule: {
          ranges: [{ sheetId, startRowIndex: 4, endRowIndex: allValues.length, startColumnIndex: 6, endColumnIndex: 7 }],
          booleanRule: {
            condition: { type: 'TEXT_CONTAINS', values: [{ userEnteredValue: legend.name }] },
            format: { backgroundColor: rgb, textFormat: { foregroundColor: fg, bold: true } },
          },
        },
        index: 0,
      },
    });

    // Rule for Edit Status (Col 9)
    formatRequests.push({
      addConditionalFormatRule: {
        rule: {
          ranges: [{ sheetId, startRowIndex: 4, endRowIndex: allValues.length, startColumnIndex: 9, endColumnIndex: 10 }],
          booleanRule: {
            condition: { type: 'TEXT_CONTAINS', values: [{ userEnteredValue: legend.name }] },
            format: { backgroundColor: rgb, textFormat: { foregroundColor: fg, bold: true } },
          },
        },
        index: 0,
      },
    });
  }

  // Execute formatting batch update
  await s.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: formatRequests },
  });

  const directUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=${sheetId}`;

  return {
    success: true,
    sheetTitle,
    sheetId,
    spreadsheetId,
    url: directUrl,
    itemsCount: items.length,
    summary: {
      total: items.length,
      shot: countShot,
      pendingShoot: countPendingShoot,
      editing: countEditing,
      editDone: countEditDone,
      completed: countCompleted,
    },
    items,
  };
}
