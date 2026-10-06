import { google, drive_v3 } from 'googleapis';
import { Readable } from 'stream';
import axios from 'axios';
import { env } from '../config/env';

let client: drive_v3.Drive | null = null;
let authClient: any = null;

export function driveConfigured() {
  return !!(env.google.serviceAccountB64 || (env.google.clientId && env.google.clientSecret && env.google.refreshToken));
}
function getAuth() {
  if (authClient) return authClient;
  if (env.google.serviceAccountB64) {
    const creds = JSON.parse(Buffer.from(env.google.serviceAccountB64, 'base64').toString('utf8'));
    authClient = new google.auth.JWT({ email: creds.client_email, key: creds.private_key, scopes: ['https://www.googleapis.com/auth/drive'] });
  } else {
    const o = new google.auth.OAuth2(env.google.clientId, env.google.clientSecret, env.google.redirectUri);
    o.setCredentials({ refresh_token: env.google.refreshToken });
    authClient = o;
  }
  return authClient;
}
export function drive() {
  if (!driveConfigured()) throw new Error('Google Drive is not configured');
  client ??= google.drive({ version: 'v3', auth: getAuth() });
  return client;
}
const common = () => ({ supportsAllDrives: true });
const escape = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

export async function findOrCreateFolder(name: string, parentId?: string): Promise<string> {
  const d = drive();

  // If parentId is explicitly specified, search inside that parent
  if (parentId) {
    const q = `mimeType='application/vnd.google-apps.folder' and name='${escape(name)}' and '${parentId}' in parents and trashed=false`;
    const list = await d.files.list({ q, fields: 'files(id,name)', includeItemsFromAllDrives: true, ...common() });
    if (list.data.files?.[0]?.id) return list.data.files[0].id;
    const created = await d.files.create({ requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }, fields: 'id', ...common() });
    return created.data.id!;
  }

  // Root folder resolution (when parentId is not specified):
  // 1. If explicit root folder ID is provided via env (e.g. DRIVE_ROOT_FOLDER_ID or GOOGLE_SHARED_DRIVE_ID)
  const envFolderId = env.google.rootFolderId || env.google.sharedDriveId;
  if (envFolderId) {
    try {
      const res = await d.files.get({ fileId: envFolderId, fields: 'id,name,trashed', ...common() });
      if (res.data.id && !res.data.trashed) return res.data.id;
    } catch (e: any) {
      console.warn('[drive] configured rootFolderId not accessible, searching by name:', e.message);
    }
  }

  // 2. Search for any folder with this name accessible to us (including folders in "Shared with me"!)
  const qShared = `mimeType='application/vnd.google-apps.folder' and name='${escape(name)}' and trashed=false`;
  const list = await d.files.list({ q: qShared, fields: 'files(id,name,owners)', includeItemsFromAllDrives: true, ...common(), pageSize: 10 });
  if (list.data.files?.[0]?.id) {
    return list.data.files[0].id;
  }

  // 3. Fallback: create in service account root
  const created = await d.files.create({ requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: ['root'] }, fields: 'id', ...common() });
  try {
    await d.permissions.create({
      fileId: created.data.id!,
      requestBody: { role: 'writer', type: 'anyone' },
      supportsAllDrives: true,
    });
  } catch (permErr: any) {
    console.warn('[drive] could not set public permission on root folder:', permErr?.message);
  }
  return created.data.id!;
}

export function serviceAccountEmail(): string | null {
  if (!env.google.serviceAccountB64) return null;
  try {
    const creds = JSON.parse(Buffer.from(env.google.serviceAccountB64, 'base64').toString('utf8'));
    return creds.client_email || null;
  } catch {
    return null;
  }
}

export async function shareFolder(id: string, email?: string): Promise<{ ok: boolean; message: string; webViewLink: string }> {
  const d = drive();
  const webViewLink = `https://drive.google.com/drive/folders/${id}`;
  if (email && email.trim()) {
    await d.permissions.create({
      fileId: id,
      requestBody: {
        role: 'writer',
        type: 'user',
        emailAddress: email.trim(),
      },
      sendNotificationEmail: true,
      supportsAllDrives: true,
    });
    return { ok: true, message: `Folder shared with ${email.trim()} with Editor permissions!`, webViewLink };
  } else {
    await d.permissions.create({
      fileId: id,
      requestBody: {
        role: 'writer',
        type: 'anyone',
      },
      supportsAllDrives: true,
    });
    return { ok: true, message: 'Folder access enabled for anyone with the link!', webViewLink };
  }
}

export async function getRootFolderStatus(): Promise<{ id?: string; name: string; found: boolean; webViewLink?: string }> {
  if (!driveConfigured()) return { name: env.google.rootFolderName, found: false };
  try {
    const id = await findOrCreateFolder(env.google.rootFolderName);
    if (id) {
      // Ensure anyone with link has access so users can view it in Drive
      try {
        await drive().permissions.create({
          fileId: id,
          requestBody: { role: 'writer', type: 'anyone' },
          supportsAllDrives: true,
        });
      } catch {}
    }
    let webViewLink = id ? `https://drive.google.com/drive/folders/${id}` : undefined;
    if (id) {
      try {
        const f = await drive().files.get({ fileId: id, fields: 'id,webViewLink', ...common() });
        if (f.data.webViewLink) webViewLink = f.data.webViewLink;
      } catch {}
    }
    return { id, name: env.google.rootFolderName, found: !!id, webViewLink };
  } catch {
    return { name: env.google.rootFolderName, found: false };
  }
}

/** Creates a resumable upload session. The browser PUTs bytes directly to the returned URL. */
export async function createResumableSession(opts: { name: string; mimeType: string; size: number; parentId: string; origin: string }) {
  const auth = getAuth();
  const { token } = await auth.getAccessToken();
  const cleanOrigin = (opts.origin || '').trim().replace(/\/+$/, '');
  const r = await axios.post(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true&fields=id,name,size,mimeType,webViewLink',
    { name: opts.name, parents: [opts.parentId], mimeType: opts.mimeType },
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': opts.mimeType, 'X-Upload-Content-Length': String(opts.size), Origin: cleanOrigin } },
  );
  return r.headers.location as string;
}

export async function uploadStream(opts: { name: string; mimeType: string; parentId: string; body: Readable }) {
  const r = await drive().files.create({ requestBody: { name: opts.name, parents: [opts.parentId] }, media: { mimeType: opts.mimeType, body: opts.body }, fields: 'id,name,size,mimeType,webViewLink', ...common() });
  return r.data;
}
export async function getFile(id: string) {
  const r = await drive().files.get({ fileId: id, fields: 'id,name,size,mimeType,parents,webViewLink,trashed,md5Checksum', ...common() });
  return r.data;
}
export async function streamFile(id: string, range?: string) {
  const r = await drive().files.get({ fileId: id, alt: 'media', ...common() }, { responseType: 'stream', headers: range ? { Range: range } : {} });
  return { stream: r.data as unknown as Readable, headers: r.headers as Record<string, string>, status: r.status };
}
export async function copyFile(id: string, parentId: string, name: string) {
  const r = await drive().files.copy({ fileId: id, requestBody: { parents: [parentId], name }, fields: 'id,webViewLink', ...common() });
  return r.data;
}
export async function listFolder(id: string) {
  const r = await drive().files.list({ q: `'${id}' in parents and trashed=false`, fields: 'files(id,name,mimeType,size,modifiedTime,webViewLink)', includeItemsFromAllDrives: true, pageSize: 200, ...common() });
  return r.data.files || [];
}
export async function storageQuota() {
  const r = await drive().about.get({ fields: 'storageQuota,user' });
  return r.data.storageQuota;
}

/** First `bytes` of a file, for content sniffing */
export async function readHead(id: string, bytes: number): Promise<Buffer> {
  const r = await drive().files.get({ fileId: id, alt: 'media', ...common() }, { responseType: 'arraybuffer', headers: { Range: `bytes=0-${bytes - 1}` } });
  return Buffer.from(r.data as unknown as ArrayBuffer);
}
export async function trashFile(id: string) { await drive().files.update({ fileId: id, requestBody: { trashed: true }, ...common() }); }
