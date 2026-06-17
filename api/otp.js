const crypto = require('crypto');
const MSG91_KEY = process.env.MSG91_AUTH_KEY || '533064Tm39MGzFYq016a322f2eP1';
const MSG91_SENDER = process.env.MSG91_SENDER_ID || 'MSGIND';
const LIMIT = 100;
let otpStore = {}, dCount = { d: '', c: 0 };

function today() { return new Date().toISOString().slice(0, 10); }
function count() { if (dCount.d !== today()) dCount = { d: today(), c: 0 }; return dCount; }
function hash(o) { return crypto.createHash('sha256').update('DS_OTP_SALT_2026_' + o).digest('hex'); }

async function sendSMS(phone, msg) {
  try {
    const r = await fetch('https://api.msg91.com/api/v2/sendsms', {
      method: 'POST',
      headers: { authkey: MSG91_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sender: MSG91_SENDER, route: '4', country: '91', sms: [{ message: msg, to: [phone] }] })
    });
    return ((await r.json()).type === 'success');
  } catch { return false; }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const action = req.query.action || '';
  const body = req.method === 'POST' ? (req.body || {}) : {};
  const phone = (body.phone || '').replace(/\D/g, '');

  if (req.method === 'GET' && action === 'status') {
    const c = count();
    return res.json({ success: true, today: c.c, limit: LIMIT, remaining: Math.max(0, LIMIT - c.c), driver: 'msg91', otp_length: 6, otp_expiry: 300 });
  }

  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed' });
  if (!/^[6-9]\d{9}$/.test(phone)) return res.status(400).json({ success: false, message: 'Invalid phone' });

  if (action === 'send' || action === 'resend') {
    const c = count();
    if (c.c >= LIMIT) return res.status(429).json({ success: false, message: 'Daily SMS limit reached' });
    let otp = '';
    for (let i = 6; i--;) otp += Math.floor(Math.random() * 10);
    const msg = `Your OTP for Aadhaar Booking is ${otp}. Valid for 5 minutes. - India Mobile Center`;
    const ok = await sendSMS(phone, msg);
    c.c++;
    if (!ok) return res.status(500).json({ success: false, message: 'SMS failed' });
    otpStore[phone] = { hash: hash(otp), exp: Date.now() + 300000, att: 0 };
    return res.json({ success: true, message: 'OTP sent' });
  }

  if (action === 'verify') {
    const inp = (body.otp || '').replace(/\D/g, '');
    if (!inp) return res.status(400).json({ success: false, message: 'Enter OTP' });
    const r = otpStore[phone];
    if (!r) return res.json({ success: false, message: 'No OTP sent' });
    if (Date.now() > r.exp) { delete otpStore[phone]; return res.json({ success: false, message: 'OTP expired' }); }
    r.att++;
    if (hash(inp) === r.hash) return res.json({ success: true, message: 'OTP verified' });
    if (r.att >= 3) { delete otpStore[phone]; return res.json({ success: false, message: 'Too many attempts' }); }
    return res.json({ success: false, message: `Wrong OTP. ${3 - r.att} left` });
  }

  return res.status(400).json({ success: false, message: 'Unknown action' });
};