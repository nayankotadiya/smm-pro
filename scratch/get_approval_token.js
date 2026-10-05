const mongoose = require('mongoose');
const crypto = require('crypto');
const dotenv = require('dotenv');
dotenv.config({ path: './.env' });

const keyOf = (secret) => crypto.createHash('sha256').update(`smm-pro:enc:${secret}`).digest();

function decrypt(payload, secret) {
  const [iv, tag, enc] = payload.split('.').map((x) => Buffer.from(x, 'base64url'));
  const d = crypto.createDecipheriv('aes-256-gcm', keyOf(secret), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
}

async function run() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/smmpro');
  const approvals = await mongoose.connection.collection('approvals').find({ 
    contentId: new mongoose.Types.ObjectId('6abfca69ceeb6852744b1451'),
    type: 'CLIENT_SCRIPT'
  }).sort({ createdAt: -1 }).toArray();

  if (!approvals.length) {
    console.log('No approvals found');
    process.exit(1);
  }

  const a = approvals[0];
  console.log('Approval ID:', a._id, 'Status:', a.status);
  
  if (a.tokenEnc) {
    const secret = process.env.JWT_SECRET;
    const dec = decrypt(a.tokenEnc, secret);
    console.log('RAW TOKEN:', dec);
    console.log('APPROVAL URL: http://localhost:5173/approval/' + dec);
  } else {
    console.log('tokenEnc is missing or wiped');
  }
  process.exit(0);
}

run().catch(console.error);
