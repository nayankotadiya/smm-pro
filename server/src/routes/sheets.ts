import { Router } from 'express';
import { ah } from '../utils/async';
import { requirePerm } from '../middleware/auth';
import { badRequest } from '../utils/errors';
import {
  sheetsConfigured,
  getSpreadsheetId,
  setSpreadsheetConfig,
  createDefaultSpreadsheet,
  syncAllToGoogleSheets,
  applyStatusConditionalFormatting,
  STATUS_COLOR_LEGEND,
  SHEETS_CONFIG,
  sheets,
  generateShooterEditorReportSheet,
} from '../integrations/sheets';
import { SystemSetting, Content, Client, Shoot } from '../models';

const r = Router();

r.get('/status', requirePerm('clients.read'), ah(async (_req, res) => {
  const configured = sheetsConfigured();
  const spreadsheetId = await getSpreadsheetId();
  const syncStatus = await SystemSetting.findOne({ key: 'google_sheets_sync_status' }).lean();
  const config = await SystemSetting.findOne({ key: 'google_sheets_config' }).lean();

  res.json({
    configured,
    spreadsheetId,
    spreadsheetUrl: spreadsheetId ? `https://docs.google.com/spreadsheets/d/${spreadsheetId}` : null,
    autoSync: config?.value?.autoSync ?? true,
    title: config?.value?.title || 'SMM Pro Master Tracker',
    syncStatus: syncStatus?.value || null,
    availableSheets: SHEETS_CONFIG,
    colorLegend: STATUS_COLOR_LEGEND,
  });
}));

// Fetch Live Data from any Google Sheets tab
r.get('/data', requirePerm('clients.read'), ah(async (req, res) => {
  const spreadsheetId = await getSpreadsheetId();
  if (!spreadsheetId) {
    return res.status(400).json({ ok: false, error: 'Google Spreadsheet is not configured.' });
  }

  const sheetName = String(req.query.sheetName || 'Content Tracker');
  const syncStatus = await SystemSetting.findOne({ key: 'google_sheets_sync_status' }).lean();

  // Fetch contents and clients lookup for instant navigation
  const [contentsList, clientsList] = await Promise.all([
    Content.find({}, '_id contentId title type platform stage clientId driveFolderId publishedUrl').lean(),
    Client.find({}, '_id name clientCode businessName').lean(),
  ]);

  const contentLookup: Record<string, any> = {};
  for (const c of contentsList) {
    if (c.contentId) {
      contentLookup[c.contentId] = {
        _id: c._id,
        title: c.title,
        type: c.type,
        platform: c.platform,
        stage: c.stage,
        clientId: c.clientId,
        driveFolderId: c.driveFolderId,
        publishedUrl: c.publishedUrl,
      };
    }
  }

  const clientLookup: Record<string, string> = {};
  for (const cl of clientsList) {
    if (cl.name) clientLookup[cl.name.toLowerCase().trim()] = String(cl._id);
    if (cl.businessName) clientLookup[cl.businessName.toLowerCase().trim()] = String(cl._id);
    if (cl.clientCode) clientLookup[cl.clientCode.toLowerCase().trim()] = String(cl._id);
  }

  try {
    const s = sheets();
    const resp = await s.spreadsheets.values.get({
      spreadsheetId,
      range: `'${sheetName}'!A1:AZ500`,
    });

    const allRows = resp.data.values || [];
    // Intelligent header detection: find the first row with >= 3 non-empty columns
    let headerIndex = 0;
    for (let i = 0; i < Math.min(8, allRows.length); i++) {
      if (allRows[i] && allRows[i].filter((cell: any) => Boolean(cell && String(cell).trim())).length >= 3) {
        headerIndex = i;
        break;
      }
    }
    const headers = allRows[headerIndex] || allRows[0] || [];
    const rows = allRows.slice(headerIndex + 1).filter((r: any[]) => r.some((c: any) => Boolean(c && String(c).trim())));

    res.json({
      ok: true,
      sheetName,
      headers,
      rows,
      totalRows: rows.length,
      contentLookup,
      clientLookup,
      spreadsheetId,
      spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}`,
      availableSheets: SHEETS_CONFIG,
      colorLegend: STATUS_COLOR_LEGEND,
      lastSyncedAt: syncStatus?.value?.lastSyncedAt || null,
    });
  } catch (err: any) {
    res.status(500).json({
      ok: false,
      sheetName,
      error: err?.response?.data?.error?.message || err.message || 'Failed to read sheet data',
      availableSheets: SHEETS_CONFIG,
      colorLegend: STATUS_COLOR_LEGEND,
    });
  }
}));

r.post('/configure', requirePerm('integrations.manage'), ah(async (req, res) => {
  const { spreadsheetId, title, autoSync } = req.body;
  if (!spreadsheetId || typeof spreadsheetId !== 'string') {
    throw badRequest('spreadsheetId is required');
  }

  // Validate ID format (either full URL or raw ID)
  let cleanId = spreadsheetId.trim();
  const match = cleanId.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match) {
    cleanId = match[1];
  }

  await setSpreadsheetConfig({
    spreadsheetId: cleanId,
    title: title || 'SMM Pro Master Tracker',
    autoSync: autoSync !== undefined ? Boolean(autoSync) : true,
  });

  res.json({
    ok: true,
    spreadsheetId: cleanId,
    spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${cleanId}`,
  });
}));

r.post('/create', requirePerm('integrations.manage'), ah(async (req, res) => {
  if (!sheetsConfigured()) {
    throw badRequest('Google credentials are not configured on this server');
  }
  const title = req.body?.title || 'SMM Pro Master Tracker';
  try {
    const result = await createDefaultSpreadsheet(title);
    res.json({
      ok: true,
      ...result,
    });
  } catch (err: any) {
    const msg = err?.response?.data?.error?.message || err.message || 'Failed to create Google Sheet';
    throw badRequest(`Google Sheets error: ${msg}`);
  }
}));

r.post('/sync', requirePerm('content.write'), ah(async (_req, res) => {
  try {
    const result = await syncAllToGoogleSheets();
    res.json(result);
  } catch (err: any) {
    const msg = err?.response?.data?.error?.message || err.message || 'Failed to sync with Google Sheets';
    throw badRequest(`Google Sheets sync error: ${msg}`);
  }
}));

r.post('/formatting', requirePerm('content.write'), ah(async (_req, res) => {
  const spreadsheetId = await getSpreadsheetId();
  if (!spreadsheetId) {
    throw badRequest('Google Spreadsheet is not configured');
  }

  try {
    await applyStatusConditionalFormatting(spreadsheetId);
    res.json({
      ok: true,
      message: 'Status color formatting applied successfully across all sheets in real-time!',
    });
  } catch (err: any) {
    const msg = err?.response?.data?.error?.message || err.message || 'Failed to apply formatting';
    throw badRequest(`Formatting error: ${msg}`);
  }
}));

r.post('/test', requirePerm('clients.read'), ah(async (req, res) => {
  if (!sheetsConfigured()) {
    return res.status(400).json({ ok: false, error: 'Google credentials not found in environment' });
  }

  const id = req.body?.spreadsheetId || (await getSpreadsheetId());
  if (!id) {
    return res.status(400).json({ ok: false, error: 'No Spreadsheet ID provided or configured' });
  }

  try {
    const s = sheets();
    const meta = await s.spreadsheets.get({ spreadsheetId: id });
    const sheetTitles = (meta.data.sheets || []).map((sh) => sh.properties?.title);
    res.json({
      ok: true,
      title: meta.data.properties?.title,
      sheets: sheetTitles,
      message: `Successfully connected to "${meta.data.properties?.title}" with ${sheetTitles.length} sheets.`,
    });
  } catch (err: any) {
    res.status(500).json({
      ok: false,
      error: err.message,
    });
  }
}));

// Generate and export a dedicated Shooter & Editor production report to a new Google Sheet
r.post('/reports/shooter-editor', requirePerm('content.write'), ah(async (req, res) => {
  try {
    const result = await generateShooterEditorReportSheet(req.body);
    res.json({
      ok: true,
      ...result,
    });
  } catch (err: any) {
    const msg = err?.response?.data?.error?.message || err.message || 'Failed to generate Shooter & Editor Google Sheet report';
    throw badRequest(`Report generation error: ${msg}`);
  }
}));

// Preview Shooter & Editor production metrics and deliverables before export
r.get('/reports/shooter-editor/preview', requirePerm('clients.read'), ah(async (req, res) => {
  const andConditions: any[] = [{ status: { $ne: 'CANCELLED' } }];

  if (req.query.clientId) {
    andConditions.push({ clientId: String(req.query.clientId) });
  }

  if (req.query.contentType) {
    andConditions.push({ type: String(req.query.contentType) });
  }

  const role = req.query.role ? String(req.query.role) : 'ALL';
  const userId = req.query.userId ? String(req.query.userId) : undefined;

  if (userId) {
    if (role === 'SHOOTER') {
      andConditions.push({ assignedShooter: userId });
    } else if (role === 'EDITOR') {
      andConditions.push({ assignedEditor: userId });
    } else {
      andConditions.push({ $or: [{ assignedShooter: userId }, { assignedEditor: userId }] });
    }
  }

  if (req.query.startDate || req.query.endDate) {
    const dateMatch: any = {};
    if (req.query.startDate) dateMatch.$gte = new Date(String(req.query.startDate));
    if (req.query.endDate) {
      const ed = new Date(String(req.query.endDate));
      ed.setHours(23, 59, 59, 999);
      dateMatch.$lte = ed;
    }
    andConditions.push({
      $or: [
        { deadline: dateMatch },
        { plannedPublicationDate: dateMatch },
        { 'stageDeadlines.shootDeadline': dateMatch },
        { 'stageDeadlines.editingDeadline': dateMatch },
        { createdAt: dateMatch },
      ],
    });
  } else if (req.query.month && req.query.year) {
    const y = Number(req.query.year);
    const m = Number(req.query.month);
    const sm = new Date(y, m - 1, 1);
    const em = new Date(y, m, 0, 23, 59, 59, 999);
    const dateMatch = { $gte: sm, $lte: em };
    andConditions.push({
      $or: [
        { deadline: dateMatch },
        { plannedPublicationDate: dateMatch },
        { 'stageDeadlines.shootDeadline': dateMatch },
        { 'stageDeadlines.editingDeadline': dateMatch },
        { createdAt: dateMatch },
      ],
    });
  } else if (req.query.year) {
    const y = Number(req.query.year);
    const sy = new Date(y, 0, 1);
    const ey = new Date(y, 11, 31, 23, 59, 59, 999);
    const dateMatch = { $gte: sy, $lte: ey };
    andConditions.push({
      $or: [
        { deadline: dateMatch },
        { plannedPublicationDate: dateMatch },
        { 'stageDeadlines.shootDeadline': dateMatch },
        { 'stageDeadlines.editingDeadline': dateMatch },
        { createdAt: dateMatch },
      ],
    });
  }

  const status = req.query.status ? String(req.query.status) : 'ALL';
  if (status !== 'ALL') {
    if (status === 'PENDING_SHOOT') {
      andConditions.push({
        stage: { $in: ['IDEA', 'SCRIPT', 'CLIENT_REVIEW', 'SHOOTING'] },
        productionStatus: { $nin: ['RAW_UPLOADED', 'EDITING', 'POSTED', 'COMPLETED'] },
      });
    } else if (status === 'SHOT') {
      andConditions.push({
        $or: [
          { stage: { $in: ['RAW_FOOTAGE', 'EDITING', 'SMM_REVIEW', 'FINAL_REVIEW', 'SCHEDULE', 'PUBLISHED'] } },
          { productionStatus: { $in: ['RAW_UPLOADED', 'EDITING', 'COMPLETED'] } },
        ],
      });
    } else if (status === 'EDITING') {
      andConditions.push({ stage: { $in: ['RAW_FOOTAGE', 'EDITING'] } });
    } else if (status === 'EDIT_DONE') {
      andConditions.push({ stage: { $in: ['SMM_REVIEW', 'FINAL_REVIEW', 'CLIENT_FINAL_APPROVAL', 'SCHEDULE', 'PUBLISHED'] } });
    } else if (status === 'COMPLETED') {
      andConditions.push({
        $or: [{ stage: 'PUBLISHED' }, { status: 'COMPLETED' }, { productionStatus: 'POSTED' }],
      });
    }
  }

  const query = andConditions.length === 1 ? andConditions[0] : { $and: andConditions };

  const items = await Content.find(query)
    .populate('clientId', 'name businessName clientCode')
    .populate('assignedShooter', 'name email role')
    .populate('assignedEditor', 'name email role')
    .populate('currentOwner', 'name role')
    .sort({ deadline: 1, plannedPublicationDate: 1, createdAt: -1 })
    .lean();

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

  res.json({
    ok: true,
    total: items.length,
    shot: countShot,
    pendingShoot: countPendingShoot,
    editing: countEditing,
    editDone: countEditDone,
    completed: countCompleted,
    items,
  });
}));

export default r;
