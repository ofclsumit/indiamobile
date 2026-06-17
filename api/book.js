function isActive(b) {
  return b.status === 'pending' || b.status === 'approved';
}

function bookingId() {
  return 'DS' + Date.now().toString().slice(-6) + Math.floor(Math.random() * 100);
}

function nextToken(bookings) {
  const max = bookings.reduce((m, b) => Math.max(m, parseInt(b.token) || 0), 0);
  return String(max + 1).padStart(2, '0');
}

async function getSyncURL(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host || '';
  const proto = req.headers['x-forwarded-proto'] || 'https';
  return `${proto}://${host}/api/sync`;
}

async function readBookings(req) {
  const url = await getSyncURL(req);
  const res = await fetch(url);
  const data = await res.json();
  return data.bookings || [];
}

async function writeBookings(req, bookings) {
  const url = await getSyncURL(req);
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'setBookings', bookings })
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = req.body || {};
  const phone = (body.phone || '').replace(/\D/g, '');
  const aadhaar = (body.aadhaar || '').replace(/\D/g, '');
  const deviceId = (body.deviceId || '').trim();
  const date = (body.date || '').trim();

  if (phone.length !== 10) return res.status(400).json({ success: false, message: 'Invalid phone' });
  if (aadhaar.length !== 12) return res.status(400).json({ success: false, message: 'Invalid Aadhaar' });
  if (!deviceId) return res.status(400).json({ success: false, message: 'Missing device ID' });
  if (!date) return res.status(400).json({ success: false, message: 'Missing date' });

  const bookings = await readBookings(req);
  const active = bookings.filter(isActive);

  const dupPhone = active.find(b => b.phone === phone);
  if (dupPhone) return res.json({ success: true, isDuplicate: true, field: 'phone', booking: dupPhone });

  const dupAadhaar = active.find(b => b.aadhaarFull === aadhaar);
  if (dupAadhaar) return res.json({ success: true, isDuplicate: true, field: 'aadhaar', booking: dupAadhaar });

  const dupDevice = active.find(b => b.deviceId === deviceId);
  if (dupDevice) return res.json({ success: true, isDuplicate: true, field: 'device', booking: dupDevice });

  const token = nextToken(active);
  const booking = {
    token,
    bookingId: bookingId(),
    phone,
    name: body.name || 'Portal User',
    aadhaarFull: aadhaar,
    aadhaarLast4: aadhaar.slice(-4),
    service: body.service || 'Aadhaar Update',
    date,
    deviceId,
    status: 'approved',
    createdAt: new Date().toISOString()
  };

  bookings.push(booking);
  await writeBookings(req, bookings);

  return res.json({ success: true, isDuplicate: false, booking });
};
