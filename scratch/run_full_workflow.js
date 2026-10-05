const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');
const FormData = require('form-data');

const BASE_URL = 'http://localhost:4000';

function fakeMp4() {
  const p = path.join(os.tmpdir(), `test_media_${Date.now()}_${Math.random().toString(36).slice(2)}.mp4`);
  const ftyp = Buffer.from([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32, 0, 0, 0, 0, 0x6d, 0x70, 0x34, 0x32, 0x69, 0x73, 0x6f, 0x6d]);
  fs.writeFileSync(p, Buffer.concat([ftyp, Buffer.alloc(4096, 1)]));
  return p;
}

async function login(email) {
  const r = await axios.post(`${BASE_URL}/api/auth/login`, { email, password: 'ChangeMe@123' });
  return r.data.accessToken;
}

async function uploadVideo(token, contentId, category) {
  const file = fakeMp4();
  const size = fs.statSync(file).size;
  const init = await axios.post(`${BASE_URL}/api/media/upload`, {
    contentId,
    category,
    fileName: 'camera_capture.mp4',
    mimeType: 'video/mp4',
    size
  }, {
    headers: { Authorization: `Bearer ${token}` }
  });

  const form = new FormData();
  form.append('file', fs.createReadStream(file));
  const up = await axios.post(`${BASE_URL}${init.data.uploadUrl}`, form, {
    headers: {
      ...form.getHeaders(),
      Authorization: `Bearer ${token}`
    }
  });
  fs.unlinkSync(file);
  return up.data;
}

async function run() {
  console.log('--- STARTING LIVE WORKFLOW EXECUTION ---');
  
  // 1. Log in users
  const nayanToken = await login('nayan@smmpro.local');
  const ishitaToken = await login('ishita@smmpro.local');
  const poojaToken = await login('pooja@smmpro.local');
  const harshToken = await login('harsh@smmpro.local');
  const rahulToken = await login('rahul@smmpro.local');
  const amanToken = await login('aman@smmpro.local');
  console.log('Logged in all staff roles successfully.');

  // 2. Fetch REEL-2026-003
  const res = (await axios.get(`${BASE_URL}/api/content`, { headers: { Authorization: `Bearer ${nayanToken}` } })).data;
  const items = Array.isArray(res) ? res : res.items;
  const c = items.find(x => x.contentId === 'REEL-2026-003');
  console.log(`Target Content: ${c.contentId} (${c.title}), Current Stage: ${c.stage}`);

  // 3. Submit Script V1 as Pooja if not submitted
  if (c.stage === 'SCRIPT') {
    console.log('Submitting script V1 as Pooja...');
    await axios.post(`${BASE_URL}/api/scripts/${c.scriptId}/submit`, {}, { headers: { Authorization: `Bearer ${poojaToken}` } });
    console.log('Script V1 submitted! Stage is now INTERNAL_REVIEW.');

    // 4. Approve Script internally as Ishita (Manager)
    const approvalsRes1 = (await axios.get(`${BASE_URL}/api/approvals`, { headers: { Authorization: `Bearer ${ishitaToken}` } })).data;
    const approvals1 = Array.isArray(approvalsRes1) ? approvalsRes1 : (approvalsRes1.items || []);
    const ap1 = approvals1.find(a => String(a.contentId?._id || a.contentId) === String(c._id) && a.type === 'INTERNAL_SCRIPT' && a.status === 'PENDING');
    if (ap1) {
      console.log(`Approving internal script approval ${ap1._id} as Ishita...`);
      await axios.post(`${BASE_URL}/api/approvals/${ap1._id}/review`, { decision: 'APPROVE' }, { headers: { Authorization: `Bearer ${ishitaToken}` } });
      console.log('Script approved internally!');
    }

    // 5. Send for Client Review as Ishita
    console.log('Sending script for Client Review...');
    const sendRes = await axios.post(`${BASE_URL}/api/approvals/send`, { contentId: c._id, kind: 'SCRIPT' }, { headers: { Authorization: `Bearer ${ishitaToken}` } });
    console.log('Client review URL generated:', sendRes.data.url);
    const token = sendRes.data.url.split('/').pop();

    // 6. Client approves via public token
    console.log('Client opening public review link...');
    await axios.post(`${BASE_URL}/api/public/approval/${token}/open`);
    console.log('Client approving script via public link...');
    await axios.post(`${BASE_URL}/api/public/approval/${token}/approve`, { name: 'Client Director' });
    console.log('Client approved script! Content advanced to SHOOTING stage.');
  }

  // 7. Shooter (Harsh) uploads RAW footage
  console.log('Shooter Harsh uploading RAW footage...');
  const rawMedia = await uploadVideo(harshToken, c._id, 'RAW');
  console.log('RAW footage uploaded:', rawMedia.fileName, 'Version:', rawMedia.version);

  // Check content stage after raw upload
  const cAfterRaw = (await axios.get(`${BASE_URL}/api/content/${c._id}`, { headers: { Authorization: `Bearer ${nayanToken}` } })).data.content;
  console.log(`Content Stage after RAW upload: ${cAfterRaw.stage}, Current Owner: ${cAfterRaw.currentOwner?.name || cAfterRaw.currentOwner}`);

  // 8. Editor (Rahul) uploads EDIT V1
  console.log('Editor Rahul uploading EDIT V1...');
  const edit1Media = await uploadVideo(rahulToken, c._id, 'EDIT');
  console.log('EDIT V1 uploaded:', edit1Media.fileName, 'Version:', edit1Media.version);

  const cAfterEdit1 = (await axios.get(`${BASE_URL}/api/content/${c._id}`, { headers: { Authorization: `Bearer ${nayanToken}` } })).data.content;
  console.log(`Content Stage after EDIT V1 upload: ${cAfterEdit1.stage}, Current Owner: ${cAfterEdit1.currentOwner?.name || cAfterEdit1.currentOwner}`);

  // 9. SMM (Aman) reviews Edit V1 and requests changes
  const approvalsRes2 = (await axios.get(`${BASE_URL}/api/approvals`, { headers: { Authorization: `Bearer ${amanToken}` } })).data;
  const approvals2 = Array.isArray(approvalsRes2) ? approvalsRes2 : (approvalsRes2.items || []);
  const apSmm = approvals2.find(a => String(a.contentId?._id || a.contentId) === String(c._id) && a.type === 'SMM' && a.status === 'PENDING');
  if (apSmm) {
    console.log(`SMM Aman reviewing Edit V1 (requesting changes at 00:08)...`);
    await axios.post(`${BASE_URL}/api/approvals/${apSmm._id}/review`, {
      decision: 'CHANGES',
      comments: [{ timestampSec: 8, comment: 'Increase subtitle font size and brighten grade' }]
    }, { headers: { Authorization: `Bearer ${amanToken}` } });
    console.log('SMM requested changes. Reverted to EDITING stage.');
  }

  // 10. Editor (Rahul) uploads EDIT V2
  console.log('Editor Rahul uploading EDIT V2...');
  const edit2Media = await uploadVideo(rahulToken, c._id, 'EDIT');
  console.log('EDIT V2 uploaded:', edit2Media.fileName, 'Version:', edit2Media.version);

  // 11. SMM (Aman) approves Edit V2
  const approvalsRes3 = (await axios.get(`${BASE_URL}/api/approvals`, { headers: { Authorization: `Bearer ${amanToken}` } })).data;
  const approvals3 = Array.isArray(approvalsRes3) ? approvalsRes3 : (approvalsRes3.items || []);
  const apSmm2 = approvals3.find(a => String(a.contentId?._id || a.contentId) === String(c._id) && a.type === 'SMM' && a.status === 'PENDING');
  if (apSmm2) {
    console.log(`SMM Aman approving Edit V2...`);
    await axios.post(`${BASE_URL}/api/approvals/${apSmm2._id}/review`, {
      decision: 'APPROVE'
    }, { headers: { Authorization: `Bearer ${amanToken}` } });
    console.log('SMM approved Edit V2!');
  }

  // 12. Final video uploaded & Final review
  console.log('Editor Rahul uploading FINAL V1...');
  const finalMedia = await uploadVideo(rahulToken, c._id, 'FINAL');
  console.log('FINAL video uploaded:', finalMedia.fileName, 'Version:', finalMedia.version);

  const approvalsRes4 = (await axios.get(`${BASE_URL}/api/approvals`, { headers: { Authorization: `Bearer ${ishitaToken}` } })).data;
  const approvals4 = Array.isArray(approvalsRes4) ? approvalsRes4 : (approvalsRes4.items || []);
  const apFinal = approvals4.find(a => String(a.contentId?._id || a.contentId) === String(c._id) && a.type === 'FINAL' && a.status === 'PENDING');
  if (apFinal) {
    console.log(`Manager Ishita approving FINAL review...`);
    await axios.post(`${BASE_URL}/api/approvals/${apFinal._id}/review`, {
      decision: 'APPROVE'
    }, { headers: { Authorization: `Bearer ${ishitaToken}` } });
    console.log('FINAL video internally approved!');
  }

  // 13. Send Final video for Client Final Approval
  console.log('Sending final video for Client Final Approval...');
  const sendFinalRes = await axios.post(`${BASE_URL}/api/approvals/send`, { contentId: c._id, kind: 'FINAL' }, { headers: { Authorization: `Bearer ${ishitaToken}` } });
  console.log('Client final approval URL:', sendFinalRes.data.url);
  const finalToken = sendFinalRes.data.url.split('/').pop();

  // 14. Client approves final video via public link
  console.log('Client approving final video via public link...');
  await axios.post(`${BASE_URL}/api/public/approval/${finalToken}/approve`, { name: 'Managing Director' });
  Working.
  
  console.log('Client APPROVED final video!');

  // Check final status and stage of content
  const cFinal = (await axios.get(`${BASE_URL}/api/content/${c._id}`, { headers: { Authorization: `Bearer ${nayanToken}` } })).data.content;
  console.log('====================================================');
  console.log(`FINAL CONTENT STATE: ${cFinal.contentId}`);
  console.log(`Stage: ${cFinal.stage}, Progress: ${cFinal.progress}%, Status: ${cFinal.status}`);
  console.log(`Current Owner: ${cFinal.currentOwner?.name || cFinal.currentOwner}`);
  console.log(`Next Action: ${cFinal.nextAction}`);
  console.log(`Last Action: ${cFinal.lastAction?.text}`);
  console.log('====================================================');

  process.exit(0);
}

run().catch((err) => {
  console.error('Error in workflow execution:', err.response?.data || err.message);
  process.exit(1);
});
