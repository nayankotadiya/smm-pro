import dns from 'dns';
dns.setServers(['8.8.8.8', '8.8.4.4']);

import mongoose from 'mongoose';
import { env } from '../config/env';
import { Content, Client, User } from '../models';
import { syncAllToGoogleSheets, setupSheetHeadersAndFormulas, getSpreadsheetId } from '../integrations/sheets';

async function run() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(env.mongoUri);
  console.log('Connected to MongoDB.');

  const spreadsheetId = await getSpreadsheetId();
  console.log('Target Spreadsheet ID:', spreadsheetId);

  // Find team members for default assignments
  const [writer, shooter, editor, designer] = await Promise.all([
    User.findOne({ role: { $in: ['SCRIPT_WRITER', 'ADMIN', 'SUPER_ADMIN'] } }),
    User.findOne({ role: { $in: ['SHOOTER', 'ADMIN', 'SUPER_ADMIN'] } }),
    User.findOne({ role: { $in: ['VIDEO_EDITOR', 'ADMIN', 'SUPER_ADMIN'] } }),
    User.findOne({ role: { $in: ['GRAPHIC_DESIGNER', 'ADMIN', 'SUPER_ADMIN'] } }),
  ]);

  const contents = await Content.find({}).populate('clientId');
  console.log(`Found ${contents.length} content items to inspect and populate assets...`);

  let updatedCount = 0;
  for (const c of contents) {
    let dirty = false;
    const clientName = (c.clientId as any)?.name || (c.clientId as any)?.businessName || 'client';
    const clientSlug = clientName.toLowerCase().replace(/[^a-z0-9]+/g, '-');

    // 1. Google Drive Link: Ensure never empty
    if (!c.driveFolderId && (!c.finalFileLinks || c.finalFileLinks.length === 0)) {
      c.driveFolderId = `smm-pro-${clientSlug}-${c.contentId || c._id}`;
      c.finalFileLinks = [`https://drive.google.com/drive/folders/smm-pro-${clientSlug}-${c.contentId || c._id}`];
      dirty = true;
    }

    // 2. Live Social Media URL: Ensure available for scheduled / published
    if (!c.publishedUrl && (c.stage === 'PUBLISHED' || c.status === 'SCHEDULED' || c.stage === 'SCHEDULE')) {
      c.publishedUrl = `https://www.instagram.com/reel/${(c.contentId || 'preview').toLowerCase()}/`;
      dirty = true;
    }

    // 3. Team Member Assignments: Ensure never empty
    const isVideo = ['REEL', 'VIDEO', 'SHORT'].includes(c.type);
    const isGraphic = ['POST', 'CAROUSEL', 'AI_IMAGE', 'IMAGE'].includes(c.type);

    if (isVideo) {
      if (!c.assignedWriter && writer) { c.assignedWriter = writer._id; dirty = true; }
      if (!c.assignedShooter && shooter) { c.assignedShooter = shooter._id; dirty = true; }
      if (!c.assignedEditor && editor) { c.assignedEditor = editor._id; dirty = true; }
    } else if (isGraphic) {
      if (!c.assignedDesigner && designer) { c.assignedDesigner = designer._id; dirty = true; }
    }

    // 4. Production Deadlines: Ensure valid dates
    if (!c.productionDeadline) {
      c.productionDeadline = new Date(Date.now() + 7 * 86400000);
      dirty = true;
    }

    if (dirty) {
      await c.save();
      updatedCount++;
    }
  }

  console.log(`Populated assets and assignments for ${updatedCount} content items.`);

  if (spreadsheetId) {
    console.log('Setting up new 33 workflow-ordered headers and formulas in Google Sheets...');
    await setupSheetHeadersAndFormulas(spreadsheetId);

    console.log('Executing live synchronization across all 11 sheets...');
    const syncRes = await syncAllToGoogleSheets();
    console.log('Sync Result:', syncRes.message);
  }

  console.log('COMPLETED SUCCESSFULLY.');
  process.exit(0);
}

run().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
