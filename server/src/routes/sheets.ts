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
} from '../integrations/sheets';
import { SystemSetting } from '../models';

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

  try {
    const s = sheets();
    const resp = await s.spreadsheets.values.get({
      spreadsheetId,
      range: `'${sheetName}'!A1:AE500`,
    });

    const allRows = resp.data.values || [];
    const headers = allRows[0] || [];
    const rows = allRows.slice(1);

    res.json({
      ok: true,
      sheetName,
      headers,
      rows,
      totalRows: rows.length,
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

export default r;
