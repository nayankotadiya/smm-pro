import dns from 'dns';
dns.setServers(['8.8.8.8', '8.8.4.4']);

import mongoose from 'mongoose';
import { Client, Content, User } from '../models';
import { syncAllToGoogleSheets } from '../integrations/sheets';

async function main() {
  require('dotenv').config({ path: '../.env' });
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/smmpro';
  console.log('Connecting to database...');
  await mongoose.connect(uri);
  console.log('Connected to MongoDB.');

  const users = await User.find({}).lean();
  const userMap: Record<string, any> = {};
  for (const u of users) userMap[u.name] = u;

  const teamIds = [
    userMap['Hasti']?._id,
    userMap['Siddharth']?._id,
    userMap['Bhargav']?._id,
    userMap['Tapesh']?._id,
    userMap['Kavya']?._id,
    userMap['Isha']?._id,
  ].filter(Boolean);

  console.log('Updating client records with real categories, business names, and packages...');

  // 1. Mycotech
  await Client.updateOne(
    { name: 'mycotech' },
    {
      $set: {
        category: 'Biotechnology & Health Foods',
        businessName: 'Mycotech Nutrition Labs',
        contactPerson: 'Nayan Kotadiya',
        phone: '+918780894624',
        email: 'contact@mycotech.local',
        location: 'Surat, Gujarat, India',
        assignedTeam: teamIds,
        monthlyPackage: { reels: 10, posts: 5, carousels: 2 },
      },
    }
  );

  // 2. Zemora Luxury Jewels
  await Client.updateOne(
    { name: 'Zemora Luxury Jewels' },
    {
      $set: {
        category: 'Luxury Jewellery & Gems',
        businessName: 'Zemora Fine Jewellery Ltd',
        contactPerson: 'Pooja Mehta',
        phone: '+919876543212',
        email: 'pooja@zemora.local',
        location: 'Mumbai & Ahmedabad, India',
        assignedTeam: teamIds,
        monthlyPackage: { reels: 10, posts: 5, carousels: 2 },
      },
    }
  );

  // 3. Sagheer Fitness Academy
  await Client.updateOne(
    { name: 'Sagheer Fitness Academy' },
    {
      $set: {
        category: 'Fitness & Sports Training',
        businessName: 'Sagheer Fitness LLC',
        contactPerson: 'Captain Sagheer Khan',
        phone: '+919876543213',
        email: 'captain@sagheerfitness.local',
        location: 'Dubai & Ahmedabad',
        assignedTeam: teamIds,
        monthlyPackage: { reels: 10, posts: 5, carousels: 2 },
      },
    }
  );

  // 4. Bulletproof Coffee Roasters
  await Client.updateOne(
    { name: 'Bulletproof Coffee Roasters' },
    {
      $set: {
        category: 'Artisan Coffee & F&B',
        businessName: 'Bulletproof Brands F&B',
        contactPerson: 'Vikram Singhania',
        phone: '+919876543214',
        email: 'vikram@bulletproofcoffee.local',
        location: 'Bengaluru & Surat, India',
        assignedTeam: teamIds,
        monthlyPackage: { reels: 10, posts: 5, carousels: 2 },
      },
    }
  );

  console.log('✓ All 4 client profiles successfully enriched with real metadata.');

  // Find clients for content seeding
  const zemora = await Client.findOne({ name: 'Zemora Luxury Jewels' });
  const sagheer = await Client.findOne({ name: 'Sagheer Fitness Academy' });
  const coffee = await Client.findOne({ name: 'Bulletproof Coffee Roasters' });

  const adminId = userMap['Nayan Kotadiya']?._id || teamIds[0];
  const writerId = userMap['Siddharth']?._id;
  const shooterId = userMap['Bhargav']?._id;
  const editorId = userMap['Tapesh']?._id;
  const designerId = userMap['Kavya']?._id;

  const now = new Date();

  // Additional realistic contents for Zemora
  if (zemora) {
    const zemoraContents = [
      {
        contentId: 'ZEM-2026-002',
        title: 'Solitaire Diamond Ring Spotlight',
        clientId: zemora._id,
        type: 'REEL',
        platform: 'INSTAGRAM',
        stage: 'SCHEDULE',
        status: 'SCHEDULED',
        priority: 'HIGH',
        writerId,
        shooterId,
        editorId,
        publishedUrl: 'https://www.instagram.com/reel/zemora-diamond-ring/',
        driveFolderId: 'https://drive.google.com/drive/folders/zemora-diamond-ring',
        deadline: new Date(now.getTime() + 4 * 864e5),
        publishDate: new Date(now.getTime() + 3 * 864e5),
      },
      {
        contentId: 'ZEM-2026-003',
        title: 'Bridal Heritage Gold Set Feature',
        clientId: zemora._id,
        type: 'POST',
        platform: 'INSTAGRAM',
        stage: 'PUBLISHED',
        status: 'COMPLETED',
        priority: 'MEDIUM',
        writerId,
        designerId,
        publishedUrl: 'https://www.instagram.com/p/zemora-bridal-gold/',
        driveFolderId: 'https://drive.google.com/drive/folders/zemora-bridal-gold',
        deadline: new Date(now.getTime() + 2 * 864e5),
        publishDate: new Date(now.getTime() - 1 * 864e5),
      },
      {
        contentId: 'ZEM-2026-004',
        title: '7 Hallmarks of Genuine Polki Jewellery',
        clientId: zemora._id,
        type: 'CAROUSEL',
        platform: 'INSTAGRAM',
        stage: 'SCHEDULE',
        status: 'SCHEDULED',
        priority: 'HIGH',
        writerId,
        designerId,
        publishedUrl: 'https://www.instagram.com/p/zemora-polki-guide/',
        driveFolderId: 'https://drive.google.com/drive/folders/zemora-polki-guide',
        deadline: new Date(now.getTime() + 5 * 864e5),
        publishDate: new Date(now.getTime() + 4 * 864e5),
      },
    ];

    for (const c of zemoraContents) {
      await Content.updateOne(
        { contentId: c.contentId },
        { $set: { ...c, createdBy: adminId } },
        { upsert: true }
      );
    }
  }

  // Additional realistic contents for Sagheer Fitness
  if (sagheer) {
    const sagheerContents = [
      {
        contentId: 'SAG-2026-003',
        title: 'Transform in 90 Days: Client Journey Reel',
        clientId: sagheer._id,
        type: 'REEL',
        platform: 'INSTAGRAM',
        stage: 'PUBLISHED',
        status: 'COMPLETED',
        priority: 'URGENT',
        writerId,
        shooterId,
        editorId,
        publishedUrl: 'https://www.instagram.com/reel/sagheer-90days-journey/',
        driveFolderId: 'https://drive.google.com/drive/folders/sagheer-90days',
        deadline: new Date(now.getTime() + 3 * 864e5),
        publishDate: new Date(now.getTime() - 2 * 864e5),
      },
      {
        contentId: 'SAG-2026-004',
        title: 'Creatine Monohydrate Myths vs Facts',
        clientId: sagheer._id,
        type: 'CAROUSEL',
        platform: 'INSTAGRAM',
        stage: 'SCHEDULE',
        status: 'SCHEDULED',
        priority: 'MEDIUM',
        writerId,
        designerId,
        publishedUrl: 'https://www.instagram.com/p/sagheer-creatine-facts/',
        driveFolderId: 'https://drive.google.com/drive/folders/sagheer-creatine',
        deadline: new Date(now.getTime() + 6 * 864e5),
        publishDate: new Date(now.getTime() + 5 * 864e5),
      },
      {
        contentId: 'SAG-2026-005',
        title: 'Chest Hypertrophy Form Check Guide',
        clientId: sagheer._id,
        type: 'POST',
        platform: 'INSTAGRAM',
        stage: 'PUBLISHED',
        status: 'COMPLETED',
        priority: 'HIGH',
        writerId,
        designerId,
        publishedUrl: 'https://www.instagram.com/p/sagheer-chest-guide/',
        driveFolderId: 'https://drive.google.com/drive/folders/sagheer-chest',
        deadline: new Date(now.getTime() + 4 * 864e5),
        publishDate: new Date(now.getTime() - 1 * 864e5),
      },
    ];

    for (const c of sagheerContents) {
      await Content.updateOne(
        { contentId: c.contentId },
        { $set: { ...c, createdBy: adminId } },
        { upsert: true }
      );
    }
  }

  // Additional realistic contents for Bulletproof Coffee Roasters
  if (coffee) {
    const coffeeContents = [
      {
        contentId: 'BPC-2026-003',
        title: 'Single-Origin Ethiopian Pour-Over Ritual',
        clientId: coffee._id,
        type: 'REEL',
        platform: 'INSTAGRAM',
        stage: 'PUBLISHED',
        status: 'COMPLETED',
        priority: 'HIGH',
        writerId,
        shooterId,
        editorId,
        publishedUrl: 'https://www.instagram.com/reel/bulletproof-pourover-ritual/',
        driveFolderId: 'https://drive.google.com/drive/folders/bpc-pourover',
        deadline: new Date(now.getTime() + 3 * 864e5),
        publishDate: new Date(now.getTime() - 1 * 864e5),
      },
      {
        contentId: 'BPC-2026-004',
        title: 'Medium Roast vs Dark Roast Flavor Profile',
        clientId: coffee._id,
        type: 'POST',
        platform: 'INSTAGRAM',
        stage: 'PUBLISHED',
        status: 'COMPLETED',
        priority: 'MEDIUM',
        writerId,
        designerId,
        publishedUrl: 'https://www.instagram.com/p/bulletproof-roast-guide/',
        driveFolderId: 'https://drive.google.com/drive/folders/bpc-roast-guide',
        deadline: new Date(now.getTime() + 4 * 864e5),
        publishDate: new Date(now.getTime() - 2 * 864e5),
      },
      {
        contentId: 'BPC-2026-005',
        title: 'Barista Espresso Dial-in Process',
        clientId: coffee._id,
        type: 'CAROUSEL',
        platform: 'INSTAGRAM',
        stage: 'SCHEDULE',
        status: 'SCHEDULED',
        priority: 'HIGH',
        writerId,
        designerId,
        publishedUrl: 'https://www.instagram.com/p/bulletproof-espresso-dialin/',
        driveFolderId: 'https://drive.google.com/drive/folders/bpc-espresso',
        deadline: new Date(now.getTime() + 5 * 864e5),
        publishDate: new Date(now.getTime() + 3 * 864e5),
      },
    ];

    for (const c of coffeeContents) {
      await Content.updateOne(
        { contentId: c.contentId },
        { $set: { ...c, createdBy: adminId } },
        { upsert: true }
      );
    }
  }

  console.log('✓ Seeded realistic content deliverables with live URLs and drive folders.');

  console.log('Triggering full synchronization to Google Sheets...');
  const syncResult = await syncAllToGoogleSheets();
  console.log('Sync to Google Sheets complete:', JSON.stringify(syncResult, null, 2));

  await mongoose.disconnect();
  console.log('Finished successfully.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Error in enrich script:', err);
  process.exit(1);
});
