import dns from 'dns';
dns.setServers(['8.8.8.8', '8.8.4.4']);

import '../config/env';
import { env } from '../config/env';

import mongoose from 'mongoose';
import { Client, Content } from '../models';
import { syncAllToGoogleSheets } from '../integrations/sheets';

async function main() {
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID || '1KIO1fYoFtGR-rG2yt1-bU9MtNIYeJccNGdMyE0qVMOA';
  const uri = env.mongoUri || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/smmpro';
  
  console.log('Connecting to MongoDB using URI from env...');
  await mongoose.connect(uri);
  console.log('Connected to MongoDB.');

  // Set default package for existing clients if missing
  const clients = await Client.find();
  for (const c of clients) {
    if (!c.monthlyPackage || !c.monthlyPackage.reels) {
      c.monthlyPackage = {
        reels: 10,
        posts: 5,
        carousels: 2,
      };
      await c.save();
      console.log(`Updated monthlyPackage for client ${c.name} -> 10 Reels, 5 Posts, 2 Carousels`);
    }
  }

  console.log(`Syncing all data and Master Plan to Google Sheet ${spreadsheetId}...`);
  const result = await syncAllToGoogleSheets(spreadsheetId);
  console.log('Sync completed successfully:', result);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Sync failed:', err);
  process.exit(1);
});
