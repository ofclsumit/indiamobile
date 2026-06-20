const PROJECT_ID = 'india-mobile-17134';

function firestoreValueToJS(val) {
  if (!val) return null;
  if (val.stringValue !== undefined) return val.stringValue;
  if (val.integerValue !== undefined) return parseInt(val.integerValue);
  if (val.doubleValue !== undefined) return val.doubleValue;
  if (val.booleanValue !== undefined) return val.booleanValue;
  if (val.nullValue !== undefined) return null;
  return null;
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
    const documentName = encodeURIComponent(email.trim().toLowerCase());
    const otpUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/otp/${documentName}`;

    const firestoreRes = await fetch(otpUrl);
    if (!firestoreRes.ok) {
      if (firestoreRes.status === 404) {
        return res.json({ success: false, message: 'No OTP found. Please request a new one.' });
      }
      const errText = await firestoreRes.text();
      console.error('Firestore OTP read failed:', errText);
      return res.status(500).json({ success: false, message: 'Failed to read OTP from database' });
    }

    const doc = await firestoreRes.json();
    const fields = doc.fields || {};
    const storedCode = firestoreValueToJS(fields.code);
    const expiresAt = firestoreValueToJS(fields.expiresAt);

    if (!storedCode || !expiresAt) {
      return res.json({ success: false, message: 'No OTP found. Please request a new one.' });
    }

    if (Date.now() > expiresAt) {
      // Delete expired OTP
      await fetch(otpUrl, { method: 'DELETE' }).catch(() => {});
      return res.json({ success: false, message: 'OTP has expired. Please request a new one.' });
    }

    if (storedCode !== code) {
      return res.json({ success: false, message: 'Incorrect OTP. Please try again.' });
    }

    // Clear OTP after successful verification
    await fetch(otpUrl, { method: 'DELETE' }).catch(() => {});

    return res.json({ success: true, email });
  } catch (e) {
    console.error('Verify OTP error:', e);
    return res.status(500).json({ success: false, message: e.message || 'Verification failed' });
  }
};
