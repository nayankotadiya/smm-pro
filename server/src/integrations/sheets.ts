import { google, sheets_v4 } from 'googleapis';
import { env } from '../config/env';
import { Content, Client, User, Task, ScheduledPost, SystemSetting, ActivityLog } from '../models';
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

/** Columns A to AB for Content Tracker */
export const CONTENT_TRACKER_HEADERS = [
  'Content ID',                   // A
  'Client',                       // B
  'Campaign',                     // C
  'Content Type',                 // D
  'Platform',                     // E
  'Topic / Brief',                // F
  'Script Owner',                 // G
  'Script Status',                // H
  'Voice-over Status',            // I
  'Shoot Status',                 // J
  'Editor',                       // K
  'Edit Status',                  // L
  'Graphic / Design Status',      // M
  'SMM Review',                   // N
  'Client Approval',              // O
  'Final Upload Status',          // P
  'Publish Date',                 // Q
  'Publish Time',                 // R
  'Schedule Status',              // S
  'Live URL',                     // T
  'Google Drive Folder / Link',   // U
  'Priority',                     // V
  'Due Date',                     // W
  'Days Left',                    // X (=IF(W2="","",W2-TODAY()))
  'Overdue',                      // Y (=IF(OR(S2="Posted",S2="Cancelled"),"No",IF(AND(W2<TODAY(),W2<>""),"YES","No")))
  'Current Owner',                // Z
  'Notes / Blocker',              // AA
  'Last Updated',                 // AB
];

export const CONTENT_TRACKER_COLUMNS = CONTENT_TRACKER_HEADERS;

export const SHEETS_CONFIG = [
  'Dashboard',
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

export const CONTENT_TYPE_SHEETS = ['Content Tracker', 'Reels', 'Posts', 'Carousels', 'AI Reels'];

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
    ['Clients', 'Master list of agency clients', 'Syncs client profile and active campaigns'],
    ['Content Tracker', 'Master central production tracker', 'Contains all content types with Days Left, Overdue formulas & Status Colors'],
    ['Reels', 'Dedicated Reels & Video production pipeline', 'Contains REEL, VIDEO, and SHORT content items'],
    ['Posts', 'Dedicated Graphic Posts pipeline', 'Contains POST and static graphic content items'],
    ['Carousels', 'Dedicated Educational Carousels pipeline', 'Contains multi-slide CAROUSEL content items'],
    ['AI Reels', 'Dedicated AI Video pipeline', 'Contains AI_REEL and AI generated video content items'],
    ['Schedule', 'Scheduled calendar for social media publishing', 'Updated upon scheduling and publishing'],
    ['Employees', 'Employee directory and task load', 'Tracks active and overdue tasks per member'],
    ['Tasks', 'Individual task breakdown', 'Connected to the SMM Pro task lifecycle'],
    [''],
    ['STATUS COLOR CODE REFERENCE'],
    ['Status', 'Hex Color', 'Stage Meaning'],
    ['Script Done', '#00D9E8', 'Script writing completed and submitted'],
    ['Voice Over', '#9575CD', 'Voice-over recorded / in-progress'],
    ['Shoot', '#FF9800', 'Shoot scheduled or underway'],
    ['Edit Done', '#FFEB00', 'Video editing completed, submitted for review'],
    ['Scheduling', '#E600E6', 'Approved and ready to schedule'],
    ['Upload Done', '#00E600', 'Final export uploaded to Google Drive'],
    ['Shoot Cancelled', '#FF0000', 'Shoot cancelled'],
    ['Client Review', '#C98555', 'Client approval pending'],
    ['Trail', '#B39DDB', 'Test or trial creative variation'],
  ];

  await s.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: 'USER_ENTERED',
      data: [
        {
          range: "'Content Tracker'!A1:AB1",
          values: [CONTENT_TRACKER_HEADERS],
        },
        {
          range: "'Reels'!A1:AB1",
          values: [CONTENT_TRACKER_HEADERS],
        },
        {
          range: "'Posts'!A1:AB1",
          values: [CONTENT_TRACKER_HEADERS],
        },
        {
          range: "'Carousels'!A1:AB1",
          values: [CONTENT_TRACKER_HEADERS],
        },
        {
          range: "'AI Reels'!A1:AB1",
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
          range: "'Setup Guide'!A1:C26",
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

  const colorMap: Record<string, string> = {
    'Script Done': '#00D9E8',
    'Voice Over': '#9575CD',
    'Shoot': '#FF9800',
    'Edit Done': '#FFEB00',
    'Scheduling': '#E600E6',
    'Upload Done': '#00E600',
    'Shoot Cancelled': '#FF0000',
    'Client Review': '#C98555',
    'Trail': '#B39DDB',
    'YES': '#FCA5A5', // Overdue Yes
    'No': '#DCFCE7',  // Overdue No
  };

  for (const sh of targetSheets) {
    const sheetId = sh.properties?.sheetId;
    if (sheetId === undefined || sheetId === null) continue;

    for (const [text, hex] of Object.entries(colorMap)) {
      const rgb = hexToRgbColor(hex);
      rules.push({
        addConditionalFormatRule: {
          rule: {
            ranges: [
              {
                sheetId,
                startRowIndex: 1,
                endRowIndex: 500,
                startColumnIndex: 0,
                endColumnIndex: 28,
              },
            ],
            booleanRule: {
              condition: {
                type: 'TEXT_EQ',
                values: [{ userEnteredValue: text }],
              },
              format: {
                backgroundColor: rgb,
                textFormat: {
                  bold: true,
                  foregroundColor: ['YES', 'Shoot Cancelled'].includes(text) ? { red: 0.8, green: 0, blue: 0 } : { red: 0, green: 0, blue: 0 },
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

/** Build Content Tracker row array with automatic formulas for Days Left (X) & Overdue (Y) */
export function buildContentRow(c: any, rowIndex: number): any[] {
  const clientName = c.clientId?.name || c.clientId?.businessName || '';
  const campaignName = c.campaignId?.name || '';
  const scriptOwner = c.assignedWriter?.name || '';
  const editor = c.assignedEditor?.name || '';
  const currentOwner = c.currentOwner?.name || '';

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
  const scriptStatus = c.stage === 'IDEA' ? 'Idea' : c.stage === 'SCRIPT' ? 'In Progress' : 'Script Done';
  const voiceoverStatus = c.stage === 'VOICE_OVER' ? 'Voice Over' : ['IDEA', 'SCRIPT'].includes(c.stage) ? 'Pending' : 'Done';
  const shootStatus = c.productionStatus === 'SHOOT_CANCELLED' ? 'Shoot Cancelled' : c.stage === 'SHOOTING' ? 'Shoot' : ['RAW_FOOTAGE', 'EDITING', 'SMM_REVIEW', 'FINAL_REVIEW', 'SCHEDULE', 'PUBLISHED'].includes(c.stage) ? 'Done' : 'Pending';
  const editStatus = ['EDITING', 'RAW_FOOTAGE'].includes(c.stage) ? 'In Progress' : ['SMM_REVIEW', 'FINAL_REVIEW', 'SCHEDULE', 'PUBLISHED'].includes(c.stage) ? 'Edit Done' : 'Pending';
  const designStatus = c.stage === 'GRAPHIC_DESIGN' ? 'In Progress' : ['SMM_REVIEW', 'FINAL_REVIEW', 'SCHEDULE', 'PUBLISHED'].includes(c.stage) ? 'Done' : 'Pending';
  const smmReview = c.stage === 'SMM_REVIEW' ? 'Needs Review' : ['FINAL_REVIEW', 'CLIENT_FINAL_APPROVAL', 'FINAL_UPLOAD', 'SCHEDULE', 'PUBLISHED'].includes(c.stage) ? 'Approved' : 'Pending';
  const clientApproval = c.approvalStatus === 'APPROVED_CLIENT' ? 'Approved' : c.approvalStatus === 'CHANGES_REQUESTED' ? 'Changes Requested' : c.stage === 'CLIENT_FINAL_APPROVAL' || c.stage === 'CLIENT_REVIEW' ? 'Client Review' : 'Pending';
  const uploadStatus = ['FINAL_UPLOAD', 'SCHEDULE', 'PUBLISHED'].includes(c.stage) ? 'Upload Done' : 'Pending';
  const scheduleStatus = c.stage === 'PUBLISHED' ? 'Posted' : c.stage === 'SCHEDULE' ? 'Scheduling' : c.status === 'CANCELLED' ? 'Cancelled' : 'In Progress';

  // Automatic Formulas
  // Days Left formula: =IF(W{row}="","",W{row}-TODAY())
  const daysLeftFormula = `=IF(ISBLANK(W${rowIndex}),"",W${rowIndex}-TODAY())`;
  // Overdue formula: =IF(OR(S{row}="Posted",S{row}="Cancelled"),"No",IF(AND(W${row}<TODAY(),W${row}<>""),"YES","No"))
  const overdueFormula = `=IF(OR(S${rowIndex}="Posted",S${rowIndex}="Cancelled"),"No",IF(AND(W${rowIndex}<TODAY(),NOT(ISBLANK(W${rowIndex}))),"YES","No"))`;

  return [
    c.contentId,                                // A
    clientName,                                 // B
    campaignName,                               // C
    c.type,                                     // D
    c.platform,                                 // E
    c.contentBrief || c.title,                  // F
    scriptOwner,                                // G
    scriptStatus,                               // H
    voiceoverStatus,                            // I
    shootStatus,                                // J
    editor,                                     // K
    editStatus,                                 // L
    designStatus,                               // M
    smmReview,                                  // N
    clientApproval,                             // O
    uploadStatus,                               // P
    pubDate,                                    // Q
    pubTime,                                    // R
    scheduleStatus,                             // S
    c.publishedUrl || '',                       // T
    driveLink,                                  // U
    c.priority || 'MEDIUM',                     // V
    dueDate,                                    // W
    daysLeftFormula,                            // X (Formula)
    overdueFormula,                             // Y (Formula)
    currentOwner,                               // Z
    c.blocked?.reason || c.notes || '',         // AA
    new Date(c.updatedAt || Date.now()).toISOString().replace('T', ' ').substring(0, 19), // AB
  ];
}

/** Full synchronization of MongoDB content and database records to Google Sheets */
export async function syncAllToGoogleSheets(): Promise<{
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
  const spreadsheetId = await getSpreadsheetId();
  if (!spreadsheetId) {
    throw new Error('Google Spreadsheet ID is not configured. Please create or configure a spreadsheet first.');
  }

  const s = sheets();

  // Ensure all 11 sheets exist (Dashboard, Clients, Content Tracker, Reels, Posts, Carousels, AI Reels, Schedule, Employees, Tasks, Setup Guide)
  await ensureAllSheetsExist(spreadsheetId);

  // 1. Fetch all active data from MongoDB
  const [contents, clients, tasks, employees, scheduledPosts] = await Promise.all([
    Content.find({ deletedAt: null })
      .sort({ createdAt: -1 })
      .populate('clientId', 'name businessName')
      .populate('campaignId', 'name')
      .populate('assignedWriter assignedShooter assignedEditor assignedDesigner assignedSMM assignedReviewer currentOwner', 'name role')
      .lean(),
    Client.find({ deletedAt: null }).sort({ name: 1 }).lean(),
    Task.find({ deletedAt: null }).sort({ createdAt: -1 }).limit(200).populate('assignedTo', 'name').populate('contentId', 'contentId').lean(),
    User.find({ active: true }).sort({ name: 1 }).lean(),
    ScheduledPost.find({}).sort({ scheduledAt: -1 }).populate('clientId', 'name').populate('contentId', 'contentId title').lean(),
  ]);

  // 2. Build rows for Master Content Tracker and Dedicated Type Trackers
  const contentRows = contents.map((c, index) => buildContentRow(c, index + 2));

  const reelsContents = contents.filter((c) => ['REEL', 'VIDEO', 'SHORT'].includes(c.type));
  const reelsRows = reelsContents.map((c, index) => buildContentRow(c, index + 2));

  const postsContents = contents.filter((c) => ['POST', 'IMAGE', 'OTHER'].includes(c.type));
  const postsRows = postsContents.map((c, index) => buildContentRow(c, index + 2));

  const carouselsContents = contents.filter((c) => c.type === 'CAROUSEL');
  const carouselsRows = carouselsContents.map((c, index) => buildContentRow(c, index + 2));

  const aiReelsContents = contents.filter((c) => ['AI_REEL', 'AI_IMAGE'].includes(c.type));
  const aiReelsRows = aiReelsContents.map((c, index) => buildContentRow(c, index + 2));

  // 3. Build Client rows
  const clientRows = clients.map((cl) => [
    String(cl._id),
    cl.name,
    cl.businessName || '',
    cl.contactPerson || '',
    cl.phone || '',
    cl.status || 'ACTIVE',
    new Date().toISOString().replace('T', ' ').substring(0, 19),
  ]);

  // 4. Build Schedule rows
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

  // 5. Build Employee rows
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

  // 6. Build Task rows
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

  // 7. Calculate Dashboard summary
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

  // 8. Clear previous rows to ensure clean sync
  try {
    await s.spreadsheets.values.batchClear({
      spreadsheetId,
      requestBody: {
        ranges: [
          "'Content Tracker'!A2:AB500",
          "'Reels'!A2:AB500",
          "'Posts'!A2:AB500",
          "'Carousels'!A2:AB500",
          "'AI Reels'!A2:AB500",
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

  // 9. Execute batch update to Google Sheets across all sheets
  const updates: sheets_v4.Schema$ValueRange[] = [
    { range: "'Dashboard'!A1:C14", values: dashboardRows },
    { range: "'Clients'!A2:G" + (clientRows.length + 1), values: clientRows },
    { range: "'Schedule'!A2:H" + (scheduleRows.length + 1), values: scheduleRows },
    { range: "'Employees'!A2:F" + (employeeRows.length + 1), values: employeeRows },
    { range: "'Tasks'!A2:H" + (taskRows.length + 1), values: taskRows },
  ];

  if (contentRows.length > 0) {
    updates.push({ range: "'Content Tracker'!A2:AB" + (contentRows.length + 1), values: contentRows });
  }
  if (reelsRows.length > 0) {
    updates.push({ range: "'Reels'!A2:AB" + (reelsRows.length + 1), values: reelsRows });
  }
  if (postsRows.length > 0) {
    updates.push({ range: "'Posts'!A2:AB" + (postsRows.length + 1), values: postsRows });
  }
  if (carouselsRows.length > 0) {
    updates.push({ range: "'Carousels'!A2:AB" + (carouselsRows.length + 1), values: carouselsRows });
  }
  if (aiReelsRows.length > 0) {
    updates.push({ range: "'AI Reels'!A2:AB" + (aiReelsRows.length + 1), values: aiReelsRows });
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
    message: `Successfully synchronized ${contents.length} content records across Master and Dedicated sheets (Reels, Posts, Carousels, AI Reels) in Google Sheets`,
  };
}

/** Synchronizes a single content item row into Google Sheets (both Master and Dedicated sheet) */
export async function syncSingleContentToSheet(contentId: string): Promise<void> {
  const spreadsheetId = await getSpreadsheetId();
  if (!spreadsheetId) return; // Silent if not configured

  try {
    const s = sheets();
    const content = await Content.findById(contentId)
      .populate('clientId', 'name businessName')
      .populate('campaignId', 'name')
      .populate('assignedWriter assignedShooter assignedEditor assignedDesigner assignedSMM assignedReviewer currentOwner', 'name role')
      .lean();

    if (!content) return;

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

      const rowData = buildContentRow(content, targetRow);

      await s.spreadsheets.values.update({
        spreadsheetId,
        range: `'${sheetName}'!A${targetRow}:AB${targetRow}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [rowData],
        },
      });
    }
  } catch (err: any) {
    console.warn(`[sheets] Failed to sync content ${contentId} to Google Sheets:`, err.message);
  }
}
