import dns from 'dns';
dns.setServers(['8.8.8.8', '8.8.4.4']);

import '../config/env';
import { env } from '../config/env';

import mongoose from 'mongoose';
import { User, Client, Content, Task, Shoot, Media, Script, ScriptVersion } from '../models';
import { getWorkflowStagesForType } from '../config/constants';
import { syncAllToGoogleSheets } from '../integrations/sheets';
import { sendClientReview, clientDecision } from '../services/approvals';

async function main() {
  const uri = env.mongoUri || process.env.MONGODB_URI;
  console.log('--- LIVE WORKFLOW TEST: REELS, POSTS, CAROUSELS ---');
  await mongoose.connect(uri!);
  console.log('✓ Connected to MongoDB Atlas');

  // Find client
  const client = await Client.findOne() || await Client.create({
    name: 'Bulletproof Brands Studio',
    clientCode: 'BPB',
    contactPerson: 'Nayan Kotadiya',
    phone: '9876543210',
    monthlyPackage: { reels: 10, posts: 5, carousels: 2 },
  });

  // Ensure monthly package
  if (!client.monthlyPackage || !client.monthlyPackage.reels) {
    client.monthlyPackage = { reels: 10, posts: 5, carousels: 2 };
    await client.save();
  }

  // Find team members
  const admin = await User.findOne({ role: 'SUPER_ADMIN' }) || await User.findOne();
  const writer = await User.findOne({ role: 'SCRIPT_WRITER' }) || admin;
  const shooter = await User.findOne({ role: 'SHOOTER' }) || admin;
  const editor = await User.findOne({ role: 'EDITOR' }) || admin;
  const designer = await User.findOne({ role: 'DESIGNER' }) || admin;
  const smm = await User.findOne({ role: 'SMM' }) || admin;

  console.log(`Team: Admin=${admin?.name}, Writer=${writer?.name}, Shooter=${shooter?.name}, Editor=${editor?.name}, Designer=${designer?.name}, SMM=${smm?.name}`);

  // ==========================================
  // 1. REEL WORKFLOW TEST
  // ==========================================
  console.log('\n--- 1. Testing REEL Workflow ---');
  const reelStages = getWorkflowStagesForType('REEL');
  console.log('Reel Stages:', reelStages);

  const countReel = await Content.countDocuments({ clientId: client._id });
  const reelCode = `${client.clientCode || 'BPB'}-${String(countReel + 1).padStart(3, '0')}`;
  
  const reel = await Content.create({
    contentId: reelCode,
    clientId: client._id,
    type: 'REEL',
    platform: 'INSTAGRAM',
    title: '5 Secrets to Viral Short-form Content',
    contentBrief: 'High-energy hook, 3 rapid-fire tips, CTA to follow',
    stage: 'SHOOTING',
    status: 'ACTIVE',
    priority: 'HIGH',
    assignedWriter: writer?._id,
    assignedShooter: shooter?._id,
    assignedEditor: editor?._id,
    assignedSMM: smm?._id,
    productionDeadline: new Date(Date.now() + 86400000 * 3),
    plannedPublicationDate: new Date(Date.now() + 86400000 * 7),
    productionStatus: 'SHOOT',
  });

  // Create Shoot record
  const shootDate = new Date(Date.now() + 86400000 * 1);
  const shoot = await Shoot.create({
    contentId: reel._id,
    clientId: client._id,
    shooterId: shooter?._id,
    shootDate,
    status: 'COMPLETED',
    checklist: { rawUploaded: true },
    notes: 'Studio shoot completed with 4K 60fps lighting setup',
  });

  console.log(`✓ Reel created: ${reel.contentId}, Shoot completed by ${shooter?.name} on ${shootDate.toISOString().split('T')[0]}`);

  // Transition Reel to Editing -> Edit Done -> Scheduled
  reel.stage = 'EDITING';
  reel.productionStatus = 'EDIT_DONE';
  reel.stageDeadlines = {
    editingDeadline: new Date(Date.now() + 86400000 * 2),
  };
  await reel.save();

  // Upload final media
  await Media.create({
    contentId: reel._id,
    clientId: client._id,
    fileName: `${reel.contentId}_Final_Cut_v1.mp4`,
    mimeType: 'video/mp4',
    category: 'FINAL',
    versionNumber: 1,
    storage: 'DRIVE',
    status: 'APPROVED',
  });

  reel.stage = 'SCHEDULE';
  reel.status = 'SCHEDULED';
  reel.scheduledAt = new Date(Date.now() + 86400000 * 4);
  await reel.save();
  console.log(`✓ Reel editing completed by ${editor?.name}, media approved, scheduled for ${reel.scheduledAt.toISOString()}`);

  // ==========================================
  // 2. POST WORKFLOW TEST (Direct Graphic)
  // ==========================================
  console.log('\n--- 2. Testing POST Workflow (Direct Graphic) ---');
  const postStages = getWorkflowStagesForType('POST');
  console.log('Post Stages:', postStages);

  const countPost = await Content.countDocuments({ clientId: client._id });
  const postCode = `${client.clientCode || 'BPB'}-${String(countPost + 1).padStart(3, '0')}`;

  const post = await Content.create({
    contentId: postCode,
    clientId: client._id,
    type: 'POST',
    platform: 'INSTAGRAM',
    title: 'Brand Growth Metrics Infographic Post',
    contentBrief: 'Clean minimalist vector graphic showcasing 300% YoY follower increase',
    stage: 'GRAPHIC_DESIGN',
    status: 'ACTIVE',
    priority: 'MEDIUM',
    assignedDesigner: designer?._id,
    assignedSMM: smm?._id,
    productionDeadline: new Date(Date.now() + 86400000 * 2),
    plannedPublicationDate: new Date(Date.now() + 86400000 * 5),
    productionStatus: 'IN_PROGRESS',
  });

  // Designer uploads image asset
  await Media.create({
    contentId: post._id,
    clientId: client._id,
    fileName: `${post.contentId}_Infographic_v1.png`,
    mimeType: 'image/png',
    category: 'IMAGE',
    versionNumber: 1,
    storage: 'DRIVE',
    status: 'READY',
  });

  // Move to SMM Review (Graphic Approval) -> Client Review
  post.stage = 'SMM_REVIEW';
  await post.save();
  console.log(`✓ Post created: ${post.contentId}, graphic submitted by ${designer?.name}, stage: SMM_REVIEW (Graphic Approval)`);

  // SMM approves graphic and initiates Client Review
  post.stage = 'CLIENT_FINAL_APPROVAL';
  await post.save();

  const authUser: any = { _id: smm?._id || admin?._id, name: smm?.name || admin?.name || 'Admin', email: smm?.email || admin?.email || 'admin@smmpro.com', role: smm?.role || admin?.role || 'SUPER_ADMIN' };
  const reviewResult = await sendClientReview(
    authUser,
    { contentId: post._id.toString(), kind: 'FINAL', sendWhatsApp: false },
    'https://smm-pro-nayankotadiya.vercel.app/approval'
  );
  console.log(`✓ Client review link generated: ${reviewResult.url}`);

  // Client approves post
  const token = reviewResult.url.split('/').pop()!;
  await clientDecision(token, 'APPROVE', { name: client.contactPerson || client.name });
  
  post.stage = 'SCHEDULE';
  post.status = 'SCHEDULED';
  post.scheduledAt = new Date(Date.now() + 86400000 * 3);
  await post.save();
  console.log(`✓ Client approved Post ${post.contentId}! Stage: SCHEDULE`);

  // ==========================================
  // 3. CAROUSEL WORKFLOW TEST (Multi-slide)
  // ==========================================
  console.log('\n--- 3. Testing CAROUSEL Workflow (Multi-slide) ---');
  const carouselStages = getWorkflowStagesForType('CAROUSEL');
  console.log('Carousel Stages:', carouselStages);

  const countCarousel = await Content.countDocuments({ clientId: client._id });
  const carouselCode = `${client.clientCode || 'BPB'}-${String(countCarousel + 1).padStart(3, '0')}`;

  const carousel = await Content.create({
    contentId: carouselCode,
    clientId: client._id,
    type: 'CAROUSEL',
    platform: 'INSTAGRAM',
    title: '7 Proven Steps to Bulletproof Video Retention',
    contentBrief: 'Slide 1: Hook, Slides 2-5: Step breakdowns, Slide 6: Summary checklist, Slide 7: CTA Save & Share',
    stage: 'GRAPHIC_DESIGN',
    status: 'ACTIVE',
    priority: 'HIGH',
    assignedDesigner: designer?._id,
    assignedSMM: smm?._id,
    productionDeadline: new Date(Date.now() + 86400000 * 2),
    plannedPublicationDate: new Date(Date.now() + 86400000 * 6),
    slideContent: [
      'Slide 1: The 3-second Retention Rule',
      'Slide 2: Pattern Interrupt Techniques',
      'Slide 3: Pacing & Micro-zoom Triggers',
      'Slide 4: Sound Design & B-roll Layering',
      'Slide 5: Open Loops Before Commercial Breaks',
      'Slide 6: Retention Analytics Cheat Sheet',
      'Slide 7: Save this Guide for Your Next Shoot',
    ],
  });

  await Media.create({
    contentId: carousel._id,
    clientId: client._id,
    fileName: `${carousel.contentId}_Carousel_Full_Deck.pdf`,
    mimeType: 'application/pdf',
    category: 'IMAGE',
    versionNumber: 1,
    storage: 'DRIVE',
    status: 'READY',
  });

  carousel.stage = 'SMM_REVIEW';
  await carousel.save();
  console.log(`✓ Carousel created: ${carousel.contentId} with 7 slides, assigned to ${designer?.name}, stage: SMM_REVIEW`);

  // ==========================================
  // 4. GOOGLE SHEETS LIVE SYNC
  // ==========================================
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID || '1KIO1fYoFtGR-rG2yt1-bU9MtNIYeJccNGdMyE0qVMOA';
  console.log(`\nSyncing all workflows to Google Sheets (${spreadsheetId})...`);
  const syncResult = await syncAllToGoogleSheets(spreadsheetId);
  console.log('✓ Google Sheets Sync Result:', syncResult);

  await mongoose.disconnect();
  console.log('\n--- ALL WORKFLOWS (REELS, POSTS, CAROUSELS) SUCCESSFULLY TESTED ---');
}

main().catch((err) => {
  console.error('Workflow test failed:', err);
  process.exit(1);
});
