import readline from 'readline';
import { google } from 'googleapis';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const question = (query: string): Promise<string> =>
  new Promise((resolve) => rl.question(query, resolve));

async function main() {
  console.log('========================================================');
  console.log('  Google Drive OAuth 2.0 Setup (Personal 15 GB Drive)  ');
  console.log('========================================================\n');
  console.log('Google Service Accounts have 0 MB storage quota.');
  console.log('OAuth 2.0 connects your personal Google Drive (15 GB free) directly!\n');

  const clientId = (await question('Enter your Google OAuth Client ID: ')).trim();
  const clientSecret = (await question('Enter your Google OAuth Client Secret: ')).trim();

  if (!clientId || !clientSecret) {
    console.error('❌ Both Client ID and Client Secret are required.');
    rl.close();
    return;
  }

  const redirectUri = 'https://developers.google.com/oauthplayground';
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/drive.file',
    ],
  });

  console.log('\n--------------------------------------------------------');
  console.log('Step 1: Open this URL in your browser and authorize Drive:');
  console.log('--------------------------------------------------------\n');
  console.log(authUrl);
  console.log('\n--------------------------------------------------------');
  console.log('Step 2: After allowing access, copy the "code" from the URL / Playground:');
  console.log('--------------------------------------------------------\n');

  const code = (await question('Enter authorization code: ')).trim();
  rl.close();

  if (!code) {
    console.error('❌ Authorization code is required.');
    return;
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);
    console.log('\n🎉 SUCCESS! Your Google Drive Refresh Token is:\n');
    console.log('GOOGLE_REFRESH_TOKEN=' + tokens.refresh_token);
    console.log('GOOGLE_CLIENT_ID=' + clientId);
    console.log('GOOGLE_CLIENT_SECRET=' + clientSecret);
    console.log('DRIVE_ROOT_FOLDER_NAME=SMM PRO');
    console.log('\nAdd these 4 variables into Render Dashboard & smm-pro/.env!');
    console.log('Now all heavy videos will upload directly into your personal 15 GB Google Drive!');
  } catch (err: any) {
    console.error('❌ Failed to exchange code for tokens:', err.message || err);
  }
}

main().catch(console.error);
