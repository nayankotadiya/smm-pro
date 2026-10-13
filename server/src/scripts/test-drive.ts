import { driveConfigured, drive } from '../integrations/drive';
import { rootFolders } from '../services/storage';
import { connectDb } from '../config/db';
import { env } from '../config/env';

async function testDrive() {
  console.log('Testing Google Drive Configuration...');
  console.log('driveConfigured():', driveConfigured());

  if (!driveConfigured()) {
    console.log('❌ Google Drive is not yet configured.');
    console.log('Please set GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 in Render dashboard or .env.');
    return;
  }

  try {
    const d = drive();
    const about = await d.about.get({ fields: 'user,storageQuota' });
    console.log('✅ Google Drive API Connected Successfully!');
    console.log('Service Account:', about.data.user?.displayName || about.data.user?.emailAddress);

    try {
      await connectDb();
      const { root, clients } = await rootFolders();
      console.log('Root Folder ID:', root);
      console.log('Clients Folder ID:', clients);
    } catch (dbErr: any) {
      console.log('Database not connected locally; Google Drive API verified directly.');
    }

    console.log('🎉 Google Drive is ready to store all videos & heavy media permanently for $0!');
  } catch (err: any) {
    console.error('❌ Google Drive connection failed:', err.message || err);
  }
}

testDrive().catch(console.error);
