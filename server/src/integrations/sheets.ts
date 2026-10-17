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

/** Columns A to AE (31 Columns) for Content Tracker & Dedicated Sheets */
export const CONTENT_TRACKER_HEADERS = [
  'Content ID',                   // A
  'Client',                       // B
  'Content Type',                 // C
  'Platform',                     // D
  'Topic / Brief',                // E
  'Script Writer',                // F
  'Script Status',                // G
  'Shooter',                      // H - Shooter Name
  'Shoot Date',                   // I - Shoot Date
  'Shoot Status',                 // J - Shoot Complete / Shoot / Shoot Cancelled / Not Required
  'Editor',                       // K - Editor Name
  'Edit Date',                    // L - Edit Date / Deadline
  'Edit Status',                  // M - Edit Complete / In Progress / Not Required
  'Graphic Designer',             // N - Designer Name
  'Design Date',                  // O - Design Date / Deadline
  'Graphic Status',               // P - Graphic Done / In Progress / Not Required
  'Graphic Approval',             // Q - SMM Review / Approved / Not Required
  'Client Approval',              // R - Client Review / Approved / Changes Requested
  'Final Upload Status',          // S - Upload Done / Pending
  'Publish Date',                 // T - Scheduled Publish Date
  'Publish Time',                 // U - Scheduled Publish Time
  'Schedule Status',              // V - Scheduling / Scheduled / Posted
  'Live URL',                     // W
  'Google Drive Link',            // X
  'Priority',                     // Y
  'Due Date',                     // Z
  'Days Left',                    // AA (=IF(ISBLANK(Z2),"",Z2-TODAY()))
  'Overdue',                      // AB (=IF(OR(V2="Posted",V2="Cancelled"),"No",IF(AND(Z2<TODAY(),NOT(ISBLANK(Z2))),"YES","No")))
  'Current Owner',                // AC
  'Notes / Blocker',              // AD
  'Last Updated',                 // AE
];

export const CONTENT_TRACKER_COLUMNS = CONTENT_TRACKER_HEADERS;

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
          columnCount: CONTENT_TYPE_SHEETS.includes(title) ? 32 : 20,
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
            columnCount: CONTENT_TYPE_SHEETS.includes(sheetTitle) ? 32 : 20,
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
    ['STATUS COLOR CODE REFERENCE (AUTOMATICALLY UPDATED)'],
    ['Status', 'Hex Color', 'Stage Meaning'],
    ['Script Done', '#00D9E8', 'Script writing completed and submitted'],
    ['Voice Over', '#9575CD', 'Voice-over recorded / in-progress'],
    ['Shoot', '#FF9800', 'Shoot scheduled or underway'],
    ['Shoot Done', '#00E600', 'Shooting completed / raw footage uploaded'],
    ['Edit Done', '#FFEB00', 'Video editing completed, submitted for review'],
    ['Scheduling', '#E600E6', 'Approved and ready to schedule'],
    ['Scheduled', '#E600E6', 'Scheduled in publishing calendar'],
    ['Upload Done', '#00E600', 'Final export uploaded to Google Drive'],
    ['Graphic Done', '#00E600', 'Graphic design completed and submitted'],
    ['Approved', '#00E600', 'Approved by internal review / client'],
    ['Posted', '#00E600', 'Published live on social media platforms'],
    ['Shoot Cancelled', '#FF0000', 'Shoot cancelled'],
    ['Client Review', '#C98555', 'Client approval pending'],
    ['Needs Review', '#C98555', 'Internal review pending'],
    ['Trail', '#B39DDB', 'Test or trial creative variation'],
    ['In Progress', '#B39DDB', 'Active work underway'],
  ];

  await s.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: 'USER_ENTERED',
      data: [
        {
          range: "'Content Tracker'!A1:AE1",
          values: [CONTENT_TRACKER_HEADERS],
        },
        {
          range: "'Reels'!A1:AE1",
          values: [CONTENT_TRACKER_HEADERS],
        },
        {
          range: "'Posts'!A1:AE1",
          values: [CONTENT_TRACKER_HEADERS],
        },
        {
          range: "'Carousels'!A1:AE1",
          values: [CONTENT_TRACKER_HEADERS],
        },
        {
          range: "'AI Reels'!A1:AE1",
          values: [CONTENT_TRACKER_HEADERS],
        },
        {
          range: "'Clients'!A1:G1",
          values: [['Client ID', 'Client Name', 'Business Name', 'Contact Person', 'Phone', 'Status', 'Last Synced']],
        },
        {
          range: "'Schedule'!A1:H1",
          values: [['Content ID', 'Client', 'Content Title', 'Platform', 'Scheduled Date & Time', 'Status', 'Live URL', 'Drive Link']],
        },
        {
          range: "'Employees'!A1:F1",
          values: [['Employee ID', 'Name', 'Email', 'Role', 'Pending Tasks', 'Last Synced']],
        },
        {
          range: "'Tasks'!A1:H1",
          values: [['Task ID', 'Content ID', 'Title', 'Assigned To', 'Kind', 'Priority', 'Status', 'Due Date']],
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
  const targetSheets = meta.data.sheets?.filter((sh) => CONTENT_TYPE_SHEETS.includes(sh.properties?.title || '')) || [];
  if (targetSheets.length === 0) return;

  const rules: sheets_v4.Schema$Request[] = [];

  const colorConfig: Record<string, { bg: string; fg: string }> = {
    'Script Done': { bg: '#00D9E8', fg: '#000000' },
    'Voice Over': { bg: '#9575CD', fg: '#FFFFFF' },
    'Shoot': { bg: '#FF9800', fg: '#000000' },
    'Shoot Done': { bg: '#00E600', fg: '#000000' },
    'Edit Done': { bg: '#FFEB00', fg: '#000000' },
    'Scheduling': { bg: '#E600E6', fg: '#FFFFFF' },
    'Scheduled': { bg: '#E600E6', fg: '#FFFFFF' },
    'Upload Done': { bg: '#00E600', fg: '#000000' },
    'Graphic Done': { bg: '#00E600', fg: '#000000' },
    'Approved': { bg: '#00E600', fg: '#000000' },
    'Completed': { bg: '#00E600', fg: '#000000' },
    'On Track': { bg: '#00E600', fg: '#000000' },
    'Posted': { bg: '#00E600', fg: '#000000' },
    'Shoot Cancelled': { bg: '#FF0000', fg: '#FFFFFF' },
    'Client Review': { bg: '#C98555', fg: '#FFFFFF' },
    'Needs Review': { bg: '#C98555', fg: '#FFFFFF' },
    'Trail': { bg: '#B39DDB', fg: '#000000' },
    'In Progress': { bg: '#B39DDB', fg: '#000000' },
    'YES': { bg: '#FF0000', fg: '#FFFFFF' }, // Overdue Yes
    'No': { bg: '#DCFCE7', fg: '#006020' },  // Overdue No
    'Action Required': { bg: '#FF0000', fg: '#FFFFFF' },
    'Not Required': { bg: '#CBD5E1', fg: '#334155' },
  };

  for (const sh of targetSheets) {
    const sheetId = sh.properties?.sheetId;
    if (sheetId === undefined || sheetId === null) continue;

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
                endColumnIndex: 35,
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

/** Build Content Tracker row array with Shooter, Editor, Graphic Designer, and automatic formulas for Days Left (AA) & Overdue (AB) */
export function buildContentRow(c: any, rowIndex: number, shootMap?: Map<string, any>): any[] {
  const clientName = c.clientId?.name || c.clientId?.businessName || '';
  const scriptOwner = c.assignedWriter?.name || '';
  const editor = c.assignedEditor?.name || '';
  const designer = c.assignedDesigner?.name || '';
  const currentOwner = c.currentOwner?.name || '';

  const shoot = shootMap ? shootMap.get(String(c._id)) : null;
  const shooterName = c.assignedShooter?.name || shoot?.shooterId?.name || '';

  // Dates
  let shootDate = '';
  if (shoot?.shootDate) {
    shootDate = new Date(shoot.shootDate).toISOString().split('T')[0];
  } else if (c.stageDeadlines?.shootDeadline) {
    shootDate = new Date(c.stageDeadlines.shootDeadline).toISOString().split('T')[0];
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
  let pubTime = c.plannedPublicationTime || '';
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
    : '';

  // Google Drive folder link
  const driveLink = c.driveFolderId
    ? `https://drive.google.com/drive/folders/${c.driveFolderId}`
    : c.finalFileLinks?.[0] || '';

  // Status mapping
  const isVideo = ['REEL', 'VIDEO', 'SHORT'].includes(c.type);
  const isGraphic = ['POST', 'CAROUSEL', 'AI_IMAGE', 'IMAGE'].includes(c.type);

  const scriptStatus = isGraphic ? 'Not Required' : (c.stage === 'IDEA' ? 'Idea' : c.stage === 'SCRIPT' ? 'In Progress' : 'Script Done');

  // Shoot Status: Shoot / Shoot Done / Shoot Cancelled / Not Required / Pending
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

  // Edit Status: Edit Done / In Progress / Not Required / Pending
  let editStatus = 'Pending';
  if (isGraphic) {
    editStatus = 'Not Required';
  } else if (['SMM_REVIEW', 'FINAL_REVIEW', 'CLIENT_FINAL_APPROVAL', 'FINAL_UPLOAD', 'SCHEDULE', 'PUBLISHED'].includes(c.stage) || c.productionStatus === 'EDIT_DONE') {
    editStatus = 'Edit Done';
  } else if (['EDITING', 'RAW_FOOTAGE'].includes(c.stage) || c.productionStatus === 'IN_PROGRESS') {
    editStatus = 'In Progress';
  }

  // Graphic Status: Graphic Done / In Progress / Not Required / Pending
  let graphicStatus = 'Pending';
  if (isVideo) {
    graphicStatus = 'Not Required';
  } else if (['SMM_REVIEW', 'FINAL_REVIEW', 'CLIENT_FINAL_APPROVAL', 'FINAL_UPLOAD', 'SCHEDULE', 'PUBLISHED'].includes(c.stage)) {
    graphicStatus = 'Graphic Done';
  } else if (c.stage === 'GRAPHIC_DESIGN') {
    graphicStatus = 'In Progress';
  }

  // Graphic Approval: Needs Review / Approved / Not Required / Pending
  let graphicApproval = 'Pending';
  if (isVideo) {
    graphicApproval = 'Not Required';
  } else if (c.stage === 'SMM_REVIEW') {
    graphicApproval = 'Needs Review';
  } else if (['FINAL_REVIEW', 'CLIENT_FINAL_APPROVAL', 'SCHEDULE', 'PUBLISHED'].includes(c.stage)) {
    graphicApproval = 'Approved';
  }

  // Client Approval
  const clientApproval = c.approvalStatus === 'APPROVED_CLIENT' ? 'Approved' : c.approvalStatus === 'CHANGES_REQUESTED' ? 'Changes Requested' : ['CLIENT_FINAL_APPROVAL', 'CLIENT_REVIEW'].includes(c.stage) ? 'Client Review' : 'Pending';

  // Upload Status
  const uploadStatus = ['FINAL_UPLOAD', 'SCHEDULE', 'PUBLISHED'].includes(c.stage) ? 'Upload Done' : 'Pending';

  // Schedule Status
  const scheduleStatus = c.stage === 'PUBLISHED' ? 'Posted' : c.stage === 'SCHEDULE' ? 'Scheduling' : c.status === 'SCHEDULED' ? 'Scheduled' : c.status === 'CANCELLED' ? 'Cancelled' : 'In Progress';

  // Automatic Formulas
  // Days Left formula: =IF(Z{row}="","",Z{row}-TODAY())
  const daysLeftFormula = `=IF(ISBLANK(Z${rowIndex}),"",Z${rowIndex}-TODAY())`;
  // Overdue formula: =IF(OR(V{row}="Posted",V{row}="Cancelled"),"No",IF(AND(Z${rowIndex}<TODAY(),NOT(ISBLANK(Z${rowIndex}))),"YES","No"))
  const overdueFormula = `=IF(OR(V${rowIndex}="Posted",V${rowIndex}="Cancelled"),"No",IF(AND(Z${rowIndex}<TODAY(),NOT(ISBLANK(Z${rowIndex}))),"YES","No"))`;

  return [
    c.contentId,                                // A
    clientName,                                 // B
    c.type,                                     // C
    c.platform,                                 // D
    c.contentBrief || c.title,                  // E
    isGraphic ? 'Not Required' : scriptOwner,   // F
    scriptStatus,                               // G
    isGraphic ? 'Not Required' : shooterName,   // H
    isGraphic ? 'Not Required' : shootDate,     // I
    shootStatus,                                // J
    isGraphic ? 'Not Required' : editor,        // K
    isGraphic ? 'Not Required' : editDate,      // L
    editStatus,                                 // M
    isVideo ? 'Not Required' : designer,        // N
    isVideo ? 'Not Required' : designDate,      // O
    graphicStatus,                              // P
    graphicApproval,                            // Q
    clientApproval,                             // R
    uploadStatus,                               // S
    pubDate,                                    // T
    pubTime,                                    // U
    scheduleStatus,                             // V
    c.publishedUrl || '',                       // W
    driveLink,                                  // X
    c.priority || 'MEDIUM',                     // Y
    dueDate,                                    // Z
    daysLeftFormula,                            // AA (Formula)
    overdueFormula,                             // AB (Formula)
    currentOwner,                               // AC
    c.blocked?.reason || c.notes || '',         // AD
    new Date(c.updatedAt || Date.now()).toISOString().replace('T', ' ').substring(0, 19), // AE
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
    'Client Code',        // A
    'Client Name',        // B
    'Target Reels',       // C
    'Reels Done',         // D
    'Reels In-Progress',  // E
    'Target Posts',       // F
    'Posts Done',         // G
    'Posts In-Progress',  // H
    'Target Carousels',   // I
    'Carousels Done',     // J
    'Total Quota',        // K
    'Total Completed',    // L
    'Shoots Done',        // M
    'Edits Done',         // N
    'Graphics Approved',  // O
    'Client Approved',    // P
    'Live / Posted',      // Q
    'Fulfillment %',      // R
    'Package Health',     // S
  ]);

  for (const cl of clients) {
    const clientContents = contents.filter((x) => String(x.clientId?._id || x.clientId) === String(cl._id));

    const targetReels = cl.monthlyPackage?.reels || 10;
    const targetPosts = cl.monthlyPackage?.posts || 5;
    const targetCarousels = cl.monthlyPackage?.carousels || 2;
    const totalTarget = targetReels + targetPosts + targetCarousels;

    const reels = clientContents.filter((x) => ['REEL', 'VIDEO', 'SHORT'].includes(x.type));
    const reelsDone = reels.filter((x) => x.stage === 'PUBLISHED' || x.status === 'COMPLETED').length;
    const reelsInProgress = reels.length - reelsDone;

    const posts = clientContents.filter((x) => ['POST', 'IMAGE', 'OTHER'].includes(x.type));
    const postsDone = posts.filter((x) => x.stage === 'PUBLISHED' || x.status === 'COMPLETED').length;
    const postsInProgress = posts.length - postsDone;

    const carousels = clientContents.filter((x) => x.type === 'CAROUSEL');
    const carouselsDone = carousels.filter((x) => x.stage === 'PUBLISHED' || x.status === 'COMPLETED').length;

    const totalDone = reelsDone + postsDone + carouselsDone;

    const shootsDone = reels.filter((x) => {
      const sh = shootMap.get(String(x._id));
      return sh?.status === 'COMPLETED' || sh?.checklist?.rawUploaded || ['RAW_FOOTAGE', 'EDITING', 'SMM_REVIEW', 'FINAL_REVIEW', 'CLIENT_FINAL_APPROVAL', 'SCHEDULE', 'PUBLISHED'].includes(x.stage);
    }).length;

    const editsDone = reels.filter((x) => ['SMM_REVIEW', 'FINAL_REVIEW', 'CLIENT_FINAL_APPROVAL', 'SCHEDULE', 'PUBLISHED'].includes(x.stage) || x.productionStatus === 'EDIT_DONE').length;
    const graphicsApproved = [...posts, ...carousels].filter((x) => ['FINAL_REVIEW', 'CLIENT_FINAL_APPROVAL', 'SCHEDULE', 'PUBLISHED'].includes(x.stage)).length;
    const clientApproved = clientContents.filter((x) => x.approvalStatus === 'APPROVED_CLIENT' || ['SCHEDULE', 'PUBLISHED'].includes(x.stage)).length;
    const livePosted = clientContents.filter((x) => x.stage === 'PUBLISHED' || x.status === 'COMPLETED').length;

    const fulfillmentPct = Math.min(100, Math.round((totalDone / Math.max(1, totalTarget)) * 100));
    const healthStatus = fulfillmentPct >= 100 ? 'Completed' : fulfillmentPct >= 50 ? 'On Track' : 'In Progress';

    rows.push([
      cl.clientCode || String(cl._id).substring(0, 6).toUpperCase(),
      cl.name,
      targetReels,
      reelsDone,
      reelsInProgress,
      targetPosts,
      postsDone,
      postsInProgress,
      targetCarousels,
      carouselsDone,
      totalTarget,
      totalDone,
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
  const clientRows = clients.map((cl) => [
    String(cl._id),
    cl.name,
    cl.businessName || '',
    cl.contactPerson || '',
    cl.phone || '',
    cl.status || 'ACTIVE',
    new Date().toISOString().replace('T', ' ').substring(0, 19),
  ]);

  // 5. Build Schedule rows
  const scheduleRows = scheduledPosts.map((p: any) => [
    p.contentId?.contentId || '',
    p.clientId?.name || '',
    p.contentId?.title || '',
    p.platform || 'INSTAGRAM',
    p.scheduledAt ? new Date(p.scheduledAt).toISOString().replace('T', ' ').substring(0, 16) : '',
    p.status || 'SCHEDULED',
    p.publishedUrl || '',
    '',
  ]);

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

  // 9. Clear previous rows to ensure clean sync
  try {
    await s.spreadsheets.values.batchClear({
      spreadsheetId,
      requestBody: {
        ranges: [
          "'Content Tracker'!A2:AE500",
          "'Master Plan'!A1:S500",
          "'Reels'!A2:AE500",
          "'Posts'!A2:AE500",
          "'Carousels'!A2:AE500",
          "'AI Reels'!A2:AE500",
          "'Clients'!A2:G500",
          "'Schedule'!A2:H500",
          "'Employees'!A2:F500",
          "'Tasks'!A2:H500",
        ],
      },
    });
  } catch (clearErr: any) {
    console.warn('[sheets] Warning clearing previous rows:', clearErr.message);
  }

  // 10. Execute batch update to Google Sheets across all sheets
  const updates: sheets_v4.Schema$ValueRange[] = [
    { range: "'Dashboard'!A1:C14", values: dashboardRows },
    { range: "'Master Plan'!A1:S" + masterPlanRows.length, values: masterPlanRows },
    { range: "'Clients'!A2:G" + (clientRows.length + 1), values: clientRows },
    { range: "'Schedule'!A2:H" + (scheduleRows.length + 1), values: scheduleRows },
    { range: "'Employees'!A2:F" + (employeeRows.length + 1), values: employeeRows },
    { range: "'Tasks'!A2:H" + (taskRows.length + 1), values: taskRows },
  ];

  if (contentRows.length > 0) {
    updates.push({ range: "'Content Tracker'!A2:AE" + (contentRows.length + 1), values: contentRows });
  }
  if (reelsRows.length > 0) {
    updates.push({ range: "'Reels'!A2:AE" + (reelsRows.length + 1), values: reelsRows });
  }
  if (postsRows.length > 0) {
    updates.push({ range: "'Posts'!A2:AE" + (postsRows.length + 1), values: postsRows });
  }
  if (carouselsRows.length > 0) {
    updates.push({ range: "'Carousels'!A2:AE" + (carouselsRows.length + 1), values: carouselsRows });
  }
  if (aiReelsRows.length > 0) {
    updates.push({ range: "'AI Reels'!A2:AE" + (aiReelsRows.length + 1), values: aiReelsRows });
  }

  await s.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: 'USER_ENTERED',
      data: updates,
    },
  });

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
