const nodemailer = require('nodemailer');
const config = require('./email-config');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: config.user, pass: config.pass }
});

function getSyncURL(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host || '';
  let proto = req.headers['x-forwarded-proto'] || 'https';
  if (host.includes('localhost') || host.includes('127.0.0.1')) {
    proto = 'http';
  }
  return `${proto}://${host}/api/sync`;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email } = req.body || {};
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ success: false, message: 'Invalid email address' });
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = Date.now() + 300000; // 5 minutes

  try {
    const syncUrl = getSyncURL(req);
    await fetch(syncUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        otps: { [email]: { code, expiresAt } }
      })
    });

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 20px;">
    <table width="520" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
      <tr><td style="background:linear-gradient(135deg,#1e3a5f,#0f2027);padding:32px 40px;text-align:center;">
        <h1 style="margin:0;color:#fff;font-size:22px;letter-spacing:0.5px;">India <span style="color:#38bdf8;">Mobile</span></h1>
      </td></tr>
      <tr><td style="padding:32px 40px;">
        <h2 style="margin:0 0 8px;font-size:18px;color:#1a1a2e;">Email Verification</h2>
        <p style="margin:0 0 20px;font-size:14px;color:#666;line-height:1.6;">Use the OTP below to verify your email address. This code expires in <strong>5 minutes</strong>.</p>
        <div style="background:#f0f4ff;border-radius:12px;padding:20px;text-align:center;border:1px dashed #38bdf8;">
          <span style="font-size:36px;font-weight:700;letter-spacing:8px;color:#1e3a5f;font-family:'Courier New',monospace;">${code}</span>
        </div>
        <p style="margin:20px 0 0;font-size:12px;color:#999;line-height:1.5;">If you did not request this code, you can safely ignore this email.</p>
      </td></tr>
      <tr><td style="background:#f8f9fb;padding:16px 40px;text-align:center;">
        <p style="margin:0;font-size:11px;color:#aaa;">India Mobile Center · Aadhaar Services</p>
      </td></tr>
    </table>
  </td></tr></table>
</body>
</html>`;

    await transporter.sendMail({
      from: '"India Mobile" <smrtx.sumit@gmail.com>',
      to: email,
      subject: 'Your OTP for Email Verification',
      html
    });

    return res.json({ success: true, message: 'OTP sent to ' + email });
  } catch (e) {
    console.error('Send OTP error:', e);
    return res.status(500).json({ success: false, message: e.message || 'Failed to send OTP' });
  }
};
