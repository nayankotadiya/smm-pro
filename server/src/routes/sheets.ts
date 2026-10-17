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
  sheets,
} from '../integrations/sheets';
import { SystemSetting } from '../models';

const r = Router();

r.get('/status', requirePerm('integrations.manage'), ah(async (_req, res) => {
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
  });
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
  const result = await createDefaultSpreadsheet(title);
  res.json({
    ok: true,
    ...result,
  });
}));

r.post('/sync', requirePerm('integrations.manage'), ah(async (_req, res) => {
  const result = await syncAllToGoogleSheets();
  res.json(result);
}));

r.post('/test', requirePerm('integrations.manage'), ah(async (req, res) => {
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
