function isActive(b) {
  return b.status === 'pending' || b.status === 'approved';
}

function bookingId() {
  return 'DS' + Date.now().toString().slice(-6) + Math.floor(Math.random() * 100);
}

// --- Firestore REST API helpers ---
const FIRESTORE_PROJECT = 'india-mobile-17134';
const FIRESTORE_DOC_PATH = 'appData/sync';
const FIRESTORE_URL = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT}/databases/(default)/documents/${FIRESTORE_DOC_PATH}`;
const BOOKINGS_COLL_URL = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT}/databases/(default)/documents/bookings`;
async function getNextTokenFromCounter(maxFromBookings) {
  const commitUrl = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT}/databases/(default)/documents:commit`;
  const docName = `projects/${FIRESTORE_PROJECT}/databases/(default)/documents/${FIRESTORE_DOC_PATH}`;

  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      const res = await fetch(commitUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          writes: [{
            transform: {
              document: docName,
              fieldTransforms: [{
                fieldPath: "lastIssuedToken",
                increment: { integerValue: "1" }
              }]
            }
          }]
        })
      });

      if (!res.ok) {
        await new Promise(r => setTimeout(r, 100 + Math.random() * 200));
        continue;
      }

      const data = await res.json();
      const result = data.writeResults?.[0]?.transformResults?.[0]?.integerValue;
      if (result !== undefined) {
        return String(parseInt(result));
      }
    } catch (e) {
      // Fall through to retry
    }

    if (attempt === 9) break;
    await new Promise(r => setTimeout(r, 100 + Math.random() * 200));
  }

  // Fallback: try a direct PATCH to initialize the counter, then one more transform attempt
  if (maxFromBookings > 0) {
    try {
      const initVal = String(maxFromBookings);
      await fetch(FIRESTORE_URL + '?updateMask.fieldPaths=lastIssuedToken', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: { lastIssuedToken: { integerValue: initVal } }
        })
      });
      for (let attempt = 0; attempt < 3; attempt++) {
        const res = await fetch(commitUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            writes: [{
              transform: {
                document: docName,
                fieldTransforms: [{
                  fieldPath: "lastIssuedToken",
                  increment: { integerValue: "1" }
                }]
              }
            }]
          })
        });
        if (res.ok) {
          const data = await res.json();
          const result = data.writeResults?.[0]?.transformResults?.[0]?.integerValue;
          if (result !== undefined) return String(parseInt(result));
        }
        await new Promise(r => setTimeout(r, 100 + Math.random() * 200));
      }
    } catch(e) {}
  }

  return '0';
}

function firestoreValueToJS(val) {
  if (val.stringValue !== undefined) return val.stringValue;
  if (val.integerValue !== undefined) return parseInt(val.integerValue);
  if (val.doubleValue !== undefined) return val.doubleValue;
  if (val.booleanValue !== undefined) return val.booleanValue;
  if (val.nullValue !== undefined) return null;
  if (val.arrayValue) return (val.arrayValue.values || []).map(firestoreValueToJS);
  if (val.mapValue) {
    const obj = {};
    for (const [k, v] of Object.entries(val.mapValue.fields || {})) {
      obj[k] = firestoreValueToJS(v);
    }
    return obj;
  }
  return null;
}

function jsToFirestoreValue(val) {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'string') return { stringValue: val };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number') {
    if (Number.isInteger(val)) return { integerValue: String(val) };
    return { doubleValue: val };
  }
  if (Array.isArray(val)) {
    return { arrayValue: { values: val.map(jsToFirestoreValue) } };
  }
  if (typeof val === 'object') {
    const fields = {};
    for (const [k, v] of Object.entries(val)) {
      fields[k] = jsToFirestoreValue(v);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

async function readBookingsFromFirestore() {
  try {
    const res = await fetch(FIRESTORE_URL);
    if (!res.ok) return null;
    const doc = await res.json();
    if (!doc.fields || !doc.fields.bookings) return [];
    return firestoreValueToJS(doc.fields.bookings) || [];
  } catch (e) {
    console.error('Firestore read failed:', e);
    return null;
  }
}

async function writeBookingsToFirestore(bookings) {
  try {
    // Use PATCH with updateMask to only update the bookings field
    const url = FIRESTORE_URL + '?updateMask.fieldPaths=bookings&updateMask.fieldPaths=_lastUpdated';
    const body = {
      fields: {
        bookings: jsToFirestoreValue(bookings),
        _lastUpdated: jsToFirestoreValue(Date.now())
      }
    };
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const text = await res.text();
      console.error('Firestore write failed:', res.status, text);
    }
  } catch (e) {
    console.error('Firestore write error:', e);
  }
}

// Fallback to sync API
async function getSyncURL(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host || '';
  let proto = req.headers['x-forwarded-proto'] || 'https';
  if (host.includes('localhost') || host.includes('127.0.0.1')) {
    proto = 'http';
  }
  return `${proto}://${host}/api/sync`;
}

async function readBookingsFallback(req) {
  const url = await getSyncURL(req);
  const res = await fetch(url);
  const data = await res.json();
  return data.bookings || [];
}

async function writeBookingsFallback(req, bookings) {
  const url = await getSyncURL(req);
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'setBookings', bookings })
  });
}

async function createBookingDocument(booking) {
  var fields = {};
  for (var k in booking) {
    if (booking.hasOwnProperty(k)) {
      fields[k] = jsToFirestoreValue(booking[k]);
    }
  }
  await fetch(BOOKINGS_COLL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: fields })
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
  const email = (body.email || '').trim().toLowerCase();
  const aadhaar = (body.aadhaar || '').replace(/\D/g, '');
  const aadhaarLast4Only = (body.aadhaarLast4 || '').replace(/\D/g, '');
  const deviceId = (body.deviceId || '').trim();
  const date = (body.date || '').trim();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ success: false, message: 'Invalid email' });
  const aadhaarValue = aadhaar.length === 12 ? aadhaar : (aadhaarLast4Only.length === 4 ? aadhaarLast4Only : '');
  if (!aadhaarValue) return res.status(400).json({ success: false, message: 'Invalid Aadhaar' });
  if (!deviceId) return res.status(400).json({ success: false, message: 'Missing device ID' });
  if (!date) return res.status(400).json({ success: false, message: 'Missing date' });

  // Try Firestore first, fallback to sync API
  let bookings = await readBookingsFromFirestore();
  let useFirestore = bookings !== null;
  if (!useFirestore) {
    bookings = await readBookingsFallback(req);
  }

  const active = bookings.filter(isActive);

  const dupEmail = active.find(b => b.email === email);
  if (dupEmail) return res.json({ success: true, isDuplicate: true, field: 'email', booking: dupEmail });

  if (aadhaar.length === 12) {
    const dupAadhaar = active.find(b => b.aadhaarFull === aadhaarValue);
    if (dupAadhaar) return res.json({ success: true, isDuplicate: true, field: 'aadhaar', booking: dupAadhaar });
  }

  const dupDevice = active.find(b => b.deviceId === deviceId);
  if (dupDevice) return res.json({ success: true, isDuplicate: true, field: 'device', booking: dupDevice });

  let token = await getNextTokenFromCounter(bookings.reduce((m, b) => Math.max(m, parseInt(b.token) || 0), 0));
  if (!token || token === '0') {
    const max = bookings.reduce((m, b) => Math.max(m, parseInt(b.token) || 0), 0);
    token = String(max + 1);
  }
  const booking = {
    token,
    bookingId: bookingId(),
    email,
    name: body.name || 'Portal User',
    aadhaarFull: aadhaarValue,
    aadhaarLast4: aadhaarValue.slice(-4),
    service: body.service || 'Aadhaar Update',
    date,
    deviceId,
    status: 'approved',
    createdAt: new Date().toISOString()
  };

  bookings.push(booking);

  // Write booking to Firestore /bookings collection (public create allowed by rules)
  try { await createBookingDocument(booking); } catch(e) {}

  // Write to Firestore appData/sync (primary) and sync API (fallback)
  if (useFirestore) {
    await writeBookingsToFirestore(bookings);
  }
  // Also write to sync API for backward compat
  try { await writeBookingsFallback(req, bookings); } catch(e) {}

  return res.json({ success: true, isDuplicate: false, booking });
};
