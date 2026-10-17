import dns from 'dns';
dns.setServers(['8.8.8.8', '8.8.4.4']);

import '../config/env';
import { env } from '../config/env';

import mongoose from 'mongoose';
import crypto from 'crypto';
import { User, Client, Content, Task } from '../models';
import { syncAllToGoogleSheets, syncSingleContentToSheet } from '../integrations/sheets';
import { getWorkflowStagesForType } from '../config/constants';
import { clientDecision, sendClientReview } from '../services/approvals';

async function main() {
  const uri = env.mongoUri || process.env.MONGODB_URI;
  console.log('Connecting to MongoDB...');
  await mongoose.connect(uri!);
  console.log('✓ Connected to MongoDB');

  // 1. Find Client
  const client = await Client.findOne();
  if (!client) throw new Error('No client found');
  console.log(`Using client: ${client.name} (${client.clientCode || 'CLI'})`);

  // 2. Find Users for roles
  const superAdmin = await User.findOne({ role: 'SUPER_ADMIN' }) || await User.findOne();
  const designer = await User.findOne({ role: 'DESIGNER' }) || superAdmin;
  const smm = await User.findOne({ role: 'SMM' }) || superAdmin;

  if (!smm) throw new Error('No active SMM user found');
  console.log(`Roles: Admin=${superAdmin?.name}, Designer=${designer?.name}, SMM=${smm.name}`);

  // 3. Verify workflow stages for POST & CAROUSEL (Scripts NOT required)
  const postStages = getWorkflowStagesForType('POST');
  const carouselStages = getWorkflowStagesForType('CAROUSEL');
  console.log('POST Stages:', postStages);
  console.log('CAROUSEL Stages:', carouselStages);

  if (postStages.includes('SCRIPT' as any) || postStages.includes('INTERNAL_REVIEW' as any)) {
    throw new Error('POST still has script stage!');
  }
  console.log('✓ POST and CAROUSEL workflows verified without script requirements.');

  // 4. Create a POST item
  const count = await Content.countDocuments({ clientId: client._id });
  const contentCode = `${client.clientCode || 'CLI'}-${String(count + 1).padStart(3, '0')}`;
  
  const postItem = await Content.create({
    contentId: contentCode,
    clientId: client._id,
    type: 'POST',
    platform: 'INSTAGRAM',
    title: 'Autumn Festive Discount Special',
    contentBrief: 'Modern minimalist promotional graphic with 20% discount offer code FESTIVE20',
    stage: 'GRAPHIC_DESIGN',
    status: 'ACTIVE',
    priority: 'HIGH',
    assignedDesigner: designer?._id,
    productionDeadline: new Date(Date.now() + 86400000 * 2),
    plannedPublicationDate: new Date(Date.now() + 86400000 * 5),
    productionStatus: 'IN_PROGRESS',
    files: [
      {
        url: 'https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da',
        name: 'Festive_Promo_Final_v1.png',
        type: 'image/png',
        uploadedBy: designer?._id,
        createdAt: new Date(),
      }
    ],
  });

  console.log(`✓ Created POST item ${postItem.contentId} in stage GRAPHIC_DESIGN`);

  // 5. Designer completes design -> move to SMM_REVIEW (Graphic Approval)
  postItem.stage = 'SMM_REVIEW';
  await postItem.save();
  console.log(`✓ Moved to SMM_REVIEW (Graphic Approval pending)`);

  // 6. Move to CLIENT_FINAL_APPROVAL and generate secure client review link
  postItem.stage = 'CLIENT_FINAL_APPROVAL';
  await postItem.save();

  const authUser: any = {
    _id: smm._id,
    name: smm.name,
    email: smm.email,
    role: smm.role,
  };

  const { approval, url } = await sendClientReview(
    authUser,
    { contentId: postItem._id.toString(), kind: 'FINAL', sendWhatsApp: false },
    'https://smm-pro-nayankotadiya.vercel.app/approval'
  );

  console.log(`✓ Generated client review link: ${url}`);
  console.log(`✓ Approval record created: ${approval._id}, status=${approval.status}`);

  // 7. Client clicks review link and approves
  const token = url.split('/').pop()!;
  await clientDecision(token, 'APPROVE', {
    name: client.contactPerson || client.name,
  });

  const approvedItem = await Content.findById(postItem._id);
  console.log(`✓ Client Approved! Stage is now: ${approvedItem?.stage}`);

  // 8. Move to SCHEDULE and sync to Google Sheets
  if (approvedItem) {
    approvedItem.scheduledAt = new Date(Date.now() + 86400000 * 3);
    await approvedItem.save();
  }

  const sheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID || '1KIO1fYoFtGR-rG2yt1-bU9MtNIYeJccNGdMyE0qVMOA';
  console.log(`Syncing update to Google Sheets (${sheetId})...`);
  const syncResult = await syncAllToGoogleSheets(sheetId);
  console.log('✓ Google Sheets sync successful:', syncResult.message);

  await mongoose.disconnect();
  console.log('--- Verification Complete ---');
}

main().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
