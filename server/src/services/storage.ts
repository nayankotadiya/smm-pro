import fs from 'fs';
import path from 'path';
import { Client, Content, DriveFolder } from '../models';
import { driveConfigured, findOrCreateFolder } from '../integrations/drive';
import { env } from '../config/env';
import { CLIENT_SUBFOLDERS, CONTENT_SUBFOLDERS } from '../config/constants';
import { slug } from '../utils/naming';

export const LOCAL_DIR = path.resolve(process.cwd(), 'uploads');
export const storageMode = () => (driveConfigured() ? 'DRIVE' : 'LOCAL') as 'DRIVE' | 'LOCAL';

async function folder(key: string, name: string, parent?: string) {
  const f = await DriveFolder.findOne({ key });
  if (f?.driveId) return f.driveId;
  const id = await findOrCreateFolder(name, parent);
  await DriveFolder.updateOne({ key }, { key, driveId: id, name, parentDriveId: parent }, { upsert: true });
  return id;
}
export async function rootFolders() {
  const root = await folder('root', env.google.rootFolderName);
  const clients = await folder('root:Clients', 'Clients', root);
  await folder('root:Templates', 'Templates', root);
  await folder('root:Archives', 'Archives', root);
  return { root, clients };
}
export async function ensureClientFolders(client: any) {
  if (!driveConfigured()) return null;
  const { clients } = await rootFolders();
  const id = await folder(`client:${client._id}`, client.name, clients);
  const subs: Record<string, string> = {};
  for (const s of CLIENT_SUBFOLDERS) subs[s] = await folder(`client:${client._id}:${s}`, s, id);
  await Client.updateOne({ _id: client._id }, { driveFolderId: id, driveSubfolders: subs });
  return { id, subs };
}
export async function ensureContentFolders(content: any) {
  if (!driveConfigured()) return null;
  const client = await Client.findById(content.clientId);
  const cf = await ensureClientFolders(client);
  const id = await folder(`content:${content._id}`, `${content.contentId}_${slug(content.title)}`, cf!.id);
  const subs: Record<string, string> = {};
  for (const s of CONTENT_SUBFOLDERS) subs[s] = await folder(`content:${content._id}:${s}`, s, id);
  await Content.updateOne({ _id: content._id }, { driveFolderId: id, driveSubfolders: subs });
  return { id, subs };
}
export function localPathFor(name: string) {
  fs.mkdirSync(LOCAL_DIR, { recursive: true });
  return path.join(LOCAL_DIR, `${Date.now()}_${name.replace(/[^\w.-]/g, '_')}`);
}
