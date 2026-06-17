const crypto = require('crypto');
const FAST2SMS_KEY = process.env.FAST2SMS_API_KEY || 'bb_xnSveCt6htm192Vs69Teg7mkFCv0mVQg';
const FAST2SMS_SENDER = process.env.FAST2SMS_SENDER_ID || 'FTWSMS';
const LIMIT = 100;
let otpStore = {}, dCount = { d: '', c: 0 };

function today() { return new Date().toISOString().slice(0, 10); }
function count() { if (dCount.d !== today()) dCount = { d: today(), c: 0 }; return dCount; }
function hash(o) { return crypto.createHash('sha256').update('DS_OTP_SALT_2026_' + o).digest('hex'); }

async function sendSMS(phone, msg) {
  try {
    const r = await fetch('https://www.fast2sms.com/dev/bulkV2', {
      method: 'POST',
      headers: { authorization: FAST2SMS_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sender_id: FAST2SMS_SENDER, message: msg, language: 'english', route: 'v3', numbers: phone })
    });
    const data = await r.json();
    return data.return === true;
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
    return res.json({ success: true, today: c.c, limit: LIMIT, remaining: Math.max(0, LIMIT - c.c), driver: 'fast2sms', otp_length: 6, otp_expiry: 300 });
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