import { driveConfigured, drive, rootFolders } from '../integrations/drive';
import { env } from '../config/env';

async function testDrive() {
  console.log('Testing Google Drive Configuration...');
  console.log('driveConfigured():', driveConfigured());

  if (!driveConfigured()) {
    console.log('❌ Google Drive is not yet configured.');
    console.log('Please set GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 (or Google OAuth credentials) in your .env or Render dashboard.');
    return;
  }

  try {
    const d = drive();
    const about = await d.about.get({ fields: 'user,storageQuota' });
    console.log('✅ Google Drive Connected Successfully!');
    console.log('Account User:', about.data.user?.displayName || about.data.user?.emailAddress);
    if (about.data.storageQuota) {
      const quota = about.data.storageQuota;
      const limitGb = quota.limit ? (Number(quota.limit) / (1024 ** 3)).toFixed(2) : 'Unlimited';
      const usageGb = quota.usage ? (Number(quota.usage) / (1024 ** 3)).toFixed(2) : '0';
      console.log(`Storage Usage: ${usageGb} GB used of ${limitGb} GB`);
    }

    const { root, clients } = await rootFolders();
    console.log('Root Folder ID:', root);
    console.log('Clients Folder ID:', clients);
    console.log('🎉 Google Drive is ready to store all videos & heavy media permanently for $0!');
  } catch (err: any) {
    console.error('❌ Google Drive connection failed:', err.message || err);
  }
}

testDrive().catch(console.error);
