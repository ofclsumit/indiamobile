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

  const { email, code } = req.body || {};
  if (!email || !code) {
    return res.status(400).json({ success: false, message: 'Email and code required' });
  }

  try {
    const syncUrl = getSyncURL(req);
    const syncRes = await fetch(syncUrl);
    const syncData = await syncRes.json();
    const otps = syncData.otps || {};
    const stored = otps[email];

    if (!stored) {
      return res.json({ success: false, message: 'No OTP found. Please request a new one.' });
    }

    if (Date.now() > stored.expiresAt) {
      return res.json({ success: false, message: 'OTP has expired. Please request a new one.' });
    }

    if (stored.code !== code) {
      return res.json({ success: false, message: 'Incorrect OTP. Please try again.' });
    }

    // Clear OTP after successful verification
    delete otps[email];
    await fetch(syncUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ otps })
    });

    return res.json({ success: true, email });
  } catch (e) {
    console.error('Verify OTP error:', e);
    return res.status(500).json({ success: false, message: e.message || 'Verification failed' });
  }
};
