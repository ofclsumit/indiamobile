const FIRESTORE_PROJECT = 'india-mobile-17134';
const BOOKINGS_COLL_URL = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT}/databases/(default)/documents/bookings`;

function bookingId() {
  return 'DS' + Date.now().toString().slice(-6) + Math.floor(Math.random() * 100);
}

// REST helper to convert Firestore values
function firestoreValueToJS(val) {
  if (!val) return null;
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

// Helper to check if a booking is active
function isActive(b) {
  const status = (b.status || '').toLowerCase();
  return status === 'pending' || status === 'approved' || status === 'in_queue' || status === 'processing';
}


// Get admin DB instance if available
let adminDb = null;
function getAdminDB() {
  if (adminDb) return adminDb;
  try {
    const admin = require('firebase-admin');
    const { getFirestore } = require('firebase-admin/firestore');
    if (!admin.apps.length) {
      admin.initializeApp({ projectId: FIRESTORE_PROJECT });
    }
    adminDb = getFirestore();
    return adminDb;
  } catch (e) {
    return null;
  }
}

// REST fallback: get next token via commit transform
async function getNextTokenREST() {
  const commitUrl = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT}/databases/(default)/documents:commit`;
  const docName = `projects/${FIRESTORE_PROJECT}/databases/(default)/documents/counters/tokenCounter`;
  try {
    const body = JSON.stringify({
      writes: [{
        transform: {
          document: docName,
          fieldTransforms: [{
            fieldPath: "lastToken",
            increment: { integerValue: "1" }
          }]
        }
      }]
    });
    const res = await fetch(commitUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body
    });
    if (res.ok) {
      const data = await res.json();
      const result = data.writeResults?.[0]?.transformResults?.[0]?.integerValue;
      if (result !== undefined) {
        return parseInt(result);
      }
    }
  } catch (e) {
    console.error('REST getNextToken error:', e);
  }
  return 0;
}

// REST fallback: read bookings
async function readBookingsREST() {
  try {
    const res = await fetch(BOOKINGS_COLL_URL);
    if (!res.ok) return [];
    const data = await res.json();
    if (!data.documents) return [];
    return data.documents.map(doc => {
      const fields = doc.fields || {};
      const obj = {};
      for (const [k, v] of Object.entries(fields)) {
        obj[k] = firestoreValueToJS(v);
      }
      obj.id = doc.name.split('/').pop();
      return obj;
    });
  } catch (e) {
    console.error('REST readBookings error:', e);
    return [];
  }
}

// REST fallback: create booking doc
async function createBookingREST(booking) {
  const fields = {};
  for (const [k, v] of Object.entries(booking)) {
    fields[k] = jsToFirestoreValue(v);
  }
  await fetch(BOOKINGS_COLL_URL + '/' + booking.bookingId, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields })
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
  const aadhaarRaw = body.aadhaarLast4 || body.aadhaar || '';
  const aadhaarLast4 = aadhaarRaw.replace(/\D/g, '').slice(-4);
  const date = (body.date || '').trim();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ success: false, message: 'Invalid email' });
  if (aadhaarLast4.length !== 4) return res.status(400).json({ success: false, message: 'Invalid Aadhaar' });
  if (!date) return res.status(400).json({ success: false, message: 'Missing date' });

  const db = getAdminDB();
  let activeBookings = [];

  if (db) {
    try {
      // Query bookings directly from Firestore
      const snap = await db.collection('bookings').get();
      snap.forEach(doc => {
        const b = doc.data();
        if (isActive(b)) {
          activeBookings.push(b);
        }
      });
    } catch (e) {
      console.warn('Admin SDK query failed, falling back to REST:', e.message);
      const all = await readBookingsREST();
      activeBookings = all.filter(isActive);
    }
  } else {
    const all = await readBookingsREST();
    activeBookings = all.filter(isActive);
  }

  // Check for duplicates
  const dupEmail = activeBookings.find(b => b.email === email);
  if (dupEmail) return res.json({ success: true, isDuplicate: true, booking: dupEmail });

  const dupAadhaar = activeBookings.find(b => b.aadhaarLast4 === aadhaarLast4);
  if (dupAadhaar) return res.json({ success: true, isDuplicate: true, booking: dupAadhaar });

  // Generate Token
  let token = 0;
  if (db) {
    try {
      const admin = require('firebase-admin');
      const counterRef = db.doc('counters/tokenCounter');
      token = await db.runTransaction(async (transaction) => {
        const doc = await transaction.get(counterRef);
        const lastToken = doc.exists ? (doc.data().lastToken || 0) : 0;
        const nextToken = lastToken + 1;
        transaction.set(counterRef, {
          lastToken: nextToken,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        return nextToken;
      });
    } catch (e) {
      console.warn('Admin SDK transaction failed, falling back to REST transform:', e.message);
      token = await getNextTokenREST();
    }
  } else {
    token = await getNextTokenREST();
  }

  if (!token) {
    return res.status(500).json({ success: false, message: 'Failed to generate token' });
  }

  const bId = bookingId();
  const tokenString = String(token).padStart(2, '0');

  const booking = {
    token: tokenString,
    bookingId: bId,
    email,
    name: body.name || 'Portal User',
    aadhaarLast4,
    service: body.service || 'Aadhaar Update',
    date,
    status: 'approved',
    createdAt: new Date().toISOString()
  };

  if (db) {
    try {
      await db.collection('bookings').doc(bId).set(booking);
    } catch (e) {
      await createBookingREST(booking);
    }
  } else {
    await createBookingREST(booking);
  }

  // Also update queue/current token status
  if (db) {
    try {
      await db.collection('queue').doc('current').set({ currentToken: token }, { merge: true });
    } catch (e) {}
  }

  return res.json({ success: true, isDuplicate: false, booking });
};
