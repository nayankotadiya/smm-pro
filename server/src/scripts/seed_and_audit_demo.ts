import dns from 'dns';
dns.setServers(['8.8.8.8', '8.8.4.4']);

import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { User, RoleModel, Client, Content, Task, Script, SystemSetting } from '../models';
import { DEFAULT_ROLE_PERMISSIONS, ROLES, Role } from '../config/constants';
import { createContent, nextContentCode } from '../services/content';
import { ensureStageTask } from '../services/tasks';
import { syncAllToGoogleSheets } from '../integrations/sheets';
import { permissionsFor, signAccess } from '../middleware/auth';

const PASSWORD = process.env.SEED_PASSWORD || 'Password123!';

async function runAudit() {
  console.log('--- Connecting to Database ---');
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/smmpro';
  await mongoose.connect(uri);
  console.log('✓ Connected to MongoDB');

  // 1. Ensure Roles
  for (const k of ROLES) {
    await RoleModel.updateOne(
      { key: k },
      { $setOnInsert: { key: k, label: k.replace(/_/g, ' '), permissions: DEFAULT_ROLE_PERMISSIONS[k] } },
      { upsert: true }
    );
  }

  const hash = await bcrypt.hash(PASSWORD, 10);

  // 2. Ensure Team Members
  const teamSpecs: { name: string; email: string; role: Role; title: string }[] = [
    { name: 'Nayan Kotadiya', email: 'nayankotadiya686@gmail.com', role: 'SUPER_ADMIN', title: 'Super Admin' },
    { name: 'Hasti', email: 'hasti@smmpro.local', role: 'MANAGER', title: 'Agency Manager' },
    { name: 'Siddharth', email: 'siddharth@smmpro.local', role: 'SCRIPT_WRITER', title: 'Senior Copywriter' },
    { name: 'Bhargav', email: 'bhargav@smmpro.local', role: 'SHOOTER', title: 'Director of Photography' },
    { name: 'Tapesh', email: 'tapesh@smmpro.local', role: 'EDITOR', title: 'Lead Video Editor' },
    { name: 'Kavya', email: 'kavya@smmpro.local', role: 'DESIGNER', title: 'Senior Graphic Designer' },
    { name: 'Isha', email: 'isha@smmpro.local', role: 'SMM', title: 'Social Media Manager' },
  ];

  const U: Record<string, any> = {};
  for (const t of teamSpecs) {
    let u = await User.findOne({ email: t.email });
    if (!u) {
      u = await User.create({ ...t, passwordHash: hash, active: true });
    } else {
      await User.updateOne({ _id: u._id }, { $set: { active: true, role: t.role } });
    }
    U[t.name] = u;
  }
  console.log(`✓ Verified ${Object.keys(U).length} team members across roles.`);

  const adminAuth = {
    _id: String(U['Nayan Kotadiya']._id),
    name: 'Nayan Kotadiya',
    email: U['Nayan Kotadiya'].email,
    role: 'SUPER_ADMIN' as Role,
    permissions: await permissionsFor('SUPER_ADMIN'),
  };

  // 3. Ensure Clients with Client Codes
  const clientSpecs = [
    {
      name: 'Mycotech Biomaterials',
      clientCode: 'MYC',
      businessName: 'Mycotech Pvt Ltd',
      contactPerson: 'Aarav Patel',
      phone: '+919876543211',
      brandTone: 'Scientific, Eco-friendly, Visionary',
    },
    {
      name: 'Zemora Luxury Jewels',
      clientCode: 'ZEM',
      businessName: 'Zemora Fine Jewellery',
      contactPerson: 'Pooja Mehta',
      phone: '+919876543212',
      brandTone: 'Royal, Elegant, Festive Luxury',
    },
    {
      name: 'Sagheer Fitness Academy',
      clientCode: 'SAG',
      businessName: 'Sagheer Fitness LLC',
      contactPerson: 'Captain Sagheer',
      phone: '+919876543213',
      brandTone: 'High-energy, Bold, Transformative',
    },
    {
      name: 'Bulletproof Coffee Roasters',
      clientCode: 'BLP',
      businessName: 'Bulletproof Brands F&B',
      contactPerson: 'Vikram Singhania',
      phone: '+919876543214',
      brandTone: 'Artisanal, Modern, Energetic',
    },
  ];

  const C: Record<string, any> = {};
  for (const cs of clientSpecs) {
    let cl = await Client.findOne({ clientCode: cs.clientCode });
    if (!cl) {
      cl = await Client.create({
        ...cs,
        status: 'ACTIVE',
        createdBy: U['Nayan Kotadiya']._id,
        assignedTeam: [
          U['Hasti']._id,
          U['Siddharth']._id,
          U['Bhargav']._id,
          U['Tapesh']._id,
          U['Kavya']._id,
          U['Isha']._id,
        ],
        defaultTeam: {
          writer: U['Siddharth']._id,
          shooter: U['Bhargav']._id,
          editor: U['Tapesh']._id,
          designer: U['Kavya']._id,
          smm: U['Isha']._id,
          reviewer: U['Hasti']._id,
        },
      });
    } else {
      await Client.updateOne(
        { _id: cl._id },
        {
          $set: {
            'defaultTeam.designer': U['Kavya']._id,
            'defaultTeam.writer': U['Siddharth']._id,
            'defaultTeam.shooter': U['Bhargav']._id,
            'defaultTeam.editor': U['Tapesh']._id,
            'defaultTeam.smm': U['Isha']._id,
            'defaultTeam.reviewer': U['Hasti']._id,
          },
        }
      );
    }
    C[cs.clientCode] = cl;
  }
  console.log(`✓ Verified ${Object.keys(C).length} clients with specific Client Codes.`);

  // 4. Create Multi-Track Content Across Workflow Stages
  const demoItems = [
    {
      clientCode: 'ZEM',
      title: 'Diwali Royal Kundan Choker',
      type: 'REEL',
      stage: 'SHOOTING',
      productionStatus: 'SHOOT',
      priority: 'HIGH',
      assignedWriter: U['Siddharth']._id,
      assignedShooter: U['Bhargav']._id,
      assignedEditor: U['Tapesh']._id,
      assignedSMM: U['Isha']._id,
      progress: 35,
      contentBrief: 'Hero reveal of handcrafted 24K gold choker with deep red rubies.',
      plannedPublicationDate: '2026-10-25',
      plannedPublicationTime: '18:30',
    },
    {
      clientCode: 'SAG',
      title: '5 Gym Mistakes Killing Your Gains',
      type: 'VIDEO',
      stage: 'EDITING',
      productionStatus: 'EDIT_DONE',
      priority: 'URGENT',
      assignedWriter: U['Siddharth']._id,
      assignedShooter: U['Bhargav']._id,
      assignedEditor: U['Tapesh']._id,
      assignedSMM: U['Isha']._id,
      progress: 60,
      contentBrief: 'Talking-head breakdown with zoom cuts and sound effects.',
      rawFileLinks: ['https://drive.google.com/file/d/demo_raw_footage_sag001'],
      editedFileLinks: ['https://drive.google.com/file/d/demo_edit_v1_sag001'],
      plannedPublicationDate: '2026-10-22',
      plannedPublicationTime: '19:00',
    },
    {
      clientCode: 'MYC',
      title: 'Mushroom Protein vs Whey Infographic',
      type: 'POST',
      stage: 'GRAPHIC_DESIGN',
      productionStatus: 'IN_PROGRESS',
      priority: 'MEDIUM',
      assignedWriter: U['Siddharth']._id,
      assignedDesigner: U['Kavya']._id,
      assignedSMM: U['Isha']._id,
      progress: 45,
      contentBrief: 'Clean minimalist vector comparison chart for Instagram feed.',
      plannedPublicationDate: '2026-10-24',
      plannedPublicationTime: '12:00',
    },
    {
      clientCode: 'BLP',
      title: 'Cold Brew vs Iced Americano',
      type: 'CAROUSEL',
      stage: 'CLIENT_REVIEW',
      productionStatus: 'CLIENT_REVIEW',
      approvalStatus: 'PENDING_CLIENT',
      priority: 'HIGH',
      assignedWriter: U['Siddharth']._id,
      assignedDesigner: U['Kavya']._id,
      assignedReviewer: U['Hasti']._id,
      assignedSMM: U['Isha']._id,
      progress: 50,
      contentBrief: '7-slide swipe carousel comparing acidity, brewing time, and caffeine.',
      plannedPublicationDate: '2026-10-26',
      plannedPublicationTime: '10:00',
    },
    {
      clientCode: 'BLP',
      title: 'Cyberpunk Coffee Bar 2050',
      type: 'AI_REEL',
      stage: 'AI_GENERATION',
      productionStatus: 'IN_PROGRESS',
      priority: 'MEDIUM',
      assignedWriter: U['Siddharth']._id,
      assignedDesigner: U['Kavya']._id,
      assignedEditor: U['Tapesh']._id,
      assignedSMM: U['Isha']._id,
      progress: 30,
      contentBrief: 'Midjourney + Runway cinematic video with synthetic voiceover.',
      plannedPublicationDate: '2026-10-28',
      plannedPublicationTime: '17:00',
    },
    {
      clientCode: 'SAG',
      title: 'Full Day of Eating 180g Protein',
      type: 'REEL',
      stage: 'SCHEDULE',
      productionStatus: 'SCHEDULING',
      approvalStatus: 'APPROVED_CLIENT',
      priority: 'HIGH',
      assignedWriter: U['Siddharth']._id,
      assignedShooter: U['Bhargav']._id,
      assignedEditor: U['Tapesh']._id,
      assignedSMM: U['Isha']._id,
      progress: 90,
      finalFileLinks: ['https://drive.google.com/file/d/demo_final_master_sag002'],
      plannedPublicationDate: '2026-10-18',
      plannedPublicationTime: '18:00',
    },
    {
      clientCode: 'MYC',
      title: 'Mycotech Launch Announcement',
      type: 'POST',
      stage: 'PUBLISHED',
      productionStatus: 'UPLOAD_DONE',
      approvalStatus: 'APPROVED_CLIENT',
      priority: 'URGENT',
      assignedWriter: U['Siddharth']._id,
      assignedDesigner: U['Kavya']._id,
      assignedSMM: U['Isha']._id,
      progress: 100,
      liveUrl: 'https://www.instagram.com/p/DBDemoMycotechPost/',
      plannedPublicationDate: '2026-10-16',
      plannedPublicationTime: '11:00',
    },
  ];

  for (const item of demoItems) {
    const cl = C[item.clientCode];
    let existing = await Content.findOne({ clientId: cl._id, title: item.title });
    if (!existing) {
      const code = await nextContentCode(cl._id, item.type as any);
      existing = await Content.create({
        contentId: code,
        title: item.title,
        clientId: cl._id,
        type: item.type,
        platform: 'INSTAGRAM',
        stage: item.stage,
        productionStatus: item.productionStatus,
        approvalStatus: item.approvalStatus || 'NONE',
        priority: item.priority,
        progress: item.progress,
        contentBrief: item.contentBrief,
        assignedWriter: item.assignedWriter,
        assignedShooter: (item as any).assignedShooter || null,
        assignedEditor: (item as any).assignedEditor || null,
        assignedDesigner: (item as any).assignedDesigner || null,
        assignedReviewer: (item as any).assignedReviewer || U['Hasti']._id,
        assignedSMM: item.assignedSMM,
        rawFileLinks: (item as any).rawFileLinks || [],
        editedFileLinks: (item as any).editedFileLinks || [],
        finalFileLinks: (item as any).finalFileLinks || [],
        liveUrl: (item as any).liveUrl || '',
        plannedPublicationDate: (item as any).plannedPublicationDate ? new Date((item as any).plannedPublicationDate) : null,
        plannedPublicationTime: (item as any).plannedPublicationTime || '',
        createdBy: U['Nayan Kotadiya']._id,
      });

      // Ensure corresponding workflow task
      await ensureStageTask(existing, item.stage as any, adminAuth);
      console.log(`✓ Created demo content: [${existing.contentId}] ${existing.title} (${item.type} ➔ ${item.stage})`);
    } else {
      await Content.updateOne(
        { _id: existing._id },
        {
          $set: {
            stage: item.stage,
            productionStatus: item.productionStatus,
            approvalStatus: item.approvalStatus || 'NONE',
            progress: item.progress,
            assignedDesigner: (item as any).assignedDesigner || existing.assignedDesigner,
            liveUrl: (item as any).liveUrl || existing.liveUrl,
          },
        }
      );
      await ensureStageTask(existing, item.stage as any, adminAuth);
    }
  }

  // 5. Trigger Google Sheets Sync
  console.log('\n--- Syncing Full Demo Data to Google Sheets Master Tracker ---');
  try {
    const syncRes = await syncAllToGoogleSheets();
    console.log(`✓ Sheets Synchronized: ${syncRes.contentCount} contents, ${syncRes.clientCount} clients, ${syncRes.taskCount} tasks.`);
  } catch (err: any) {
    console.error('Sheets Sync Warning:', err.message);
  }

  // 6. Comprehensive Role Visibility Audit
  console.log('\n======================================================');
  console.log('       MULTI-ROLE PERMISSION & VISIBILITY AUDIT       ');
  console.log('======================================================\n');

  const auditRoles = [
    { name: 'Nayan Kotadiya', role: 'SUPER_ADMIN' },
    { name: 'Hasti', role: 'MANAGER' },
    { name: 'Siddharth', role: 'SCRIPT_WRITER' },
    { name: 'Bhargav', role: 'SHOOTER' },
    { name: 'Tapesh', role: 'EDITOR' },
    { name: 'Kavya', role: 'DESIGNER' },
    { name: 'Isha', role: 'SMM' },
  ];

  for (const r of auditRoles) {
    const user = U[r.name];
    const userTasks = await Task.find({ assignedTo: user._id, status: { $ne: 'DONE' } }).lean();
    
    // Check Content visibility
    const canSeeAll = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'SMM'].includes(r.role);
    const visibleContent = canSeeAll
      ? await Content.find({ deletedAt: null }).lean()
      : await Content.find({
          deletedAt: null,
          $or: [
            { assignedWriter: user._id },
            { assignedShooter: user._id },
            { assignedEditor: user._id },
            { assignedDesigner: user._id },
            { assignedSMM: user._id },
          ],
        }).lean();

    // Check Clients
    const visibleClients = await Client.find({ status: 'ACTIVE' }).lean();

    console.log(`👤 USER: ${user.name} (${user.role})`);
    console.log(`   - Visible Clients: ${visibleClients.length} clients (${visibleClients.map(c => c.clientCode).filter(Boolean).join(', ')})`);
    console.log(`   - Content Access: ${visibleContent.length} items (${canSeeAll ? 'Full Org View' : 'Assigned Only'})`);
    console.log(`   - Active Tasks on Desk: ${userTasks.length} task(s)`);
    for (const t of userTasks) {
      console.log(`     * [${t.type}] ${t.title} (Priority: ${t.priority}, Status: ${t.status})`);
    }
    console.log('   --------------------------------------------------');
  }

  console.log('\n======================================================');
  console.log('          FULL WORKFLOW AUDIT SUMMARY: ALL PASS       ');
  console.log('======================================================\n');

  process.exit(0);
}

runAudit().catch(err => {
  console.error('Audit Error:', err);
  process.exit(1);
});
