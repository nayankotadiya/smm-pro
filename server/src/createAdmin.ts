/**
 * Creates (or resets) a Super Admin without loading any sample data.
 *   npm run create-admin -- "Full Name" email@company.com "StrongPassword"
 */
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { connectDb } from './config/db';
import { User, RoleModel } from './models';
import { DEFAULT_ROLE_PERMISSIONS, ROLES } from './config/constants';
import { seedAutomations } from './services/automation';

async function main() {
  const [name, email, password] = process.argv.slice(2);
  if (!name || !email || !password || password.length < 8) { console.error('Usage: npm run create-admin -- "Full Name" email@company.com "password (8+ characters)"'); process.exit(1); }
  await connectDb();
  for (const k of ROLES) await RoleModel.updateOne({ key: k }, { $setOnInsert: { key: k, label: k.replace(/_/g, ' '), permissions: DEFAULT_ROLE_PERMISSIONS[k] } }, { upsert: true });
  await seedAutomations();
  const passwordHash = await bcrypt.hash(password, 12);
  const u = await User.findOneAndUpdate({ email: email.toLowerCase() }, { name, email: email.toLowerCase(), role: 'SUPER_ADMIN', passwordHash, active: true }, { upsert: true, new: true });
  console.log(`Super Admin ready: ${u!.email}`);
  await mongoose.disconnect();
}
main().catch((e) => { console.error(e.message); process.exit(1); });
