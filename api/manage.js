const FIRESTORE_PROJECT = 'india-mobile-17134';
const BOOKING_ID = 'Zq539q2yM2kFULgxSvx3';

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

async function getGcpAccessToken() {
  try {
    const http = require('http');
    return new Promise((resolve) => {
      const opts = {
        hostname: 'metadata.google.internal',
        path: '/computeMetadata/v1/instance/service-accounts/default/token',
        method: 'GET',
        headers: { 'Metadata-Flavor': 'Google' },
        timeout: 3000
      };
      const req = http.request(opts, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          try { resolve(JSON.parse(data).access_token); } catch(e) { resolve(null); }
        });
      });
      req.on('error', () => resolve(null));
      req.on('timeout', () => { req.destroy(); resolve(null); });
      req.end();
    });
  } catch(e) { return null; }
}

async function firestoreFetch(url, options) {
  const accessToken = await getGcpAccessToken();
  const headers = { 'Content-Type': 'application/json' };
  if (accessToken) headers['Authorization'] = 'Bearer ' + accessToken;
  const merged = Object.assign({}, options, { headers: Object.assign({}, headers, (options && options.headers) || {}) });
  try {
    const res = await fetch(url, merged);
    return res;
  } catch(e) {
    if (accessToken) throw e;
    return null;
  }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = req.body || {};
  const action = body.action || '';

  if (action === 'cancelBooking' || action === 'forceCancel') {
    const bookingId = body.bookingId || BOOKING_ID;
    const results = { bookingDoc: null, syncDoc: null };

    const docUrl = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT}/databases/(default)/documents/bookings/${bookingId}`;
    const cancelData = {
      fields: {
        status: { stringValue: 'cancelled' },
        updatedAt: { stringValue: new Date().toISOString() }
      }
    };

    // Try with metadata token auth (only works on Vercel)
    try {
      const patchRes = await firestoreFetch(docUrl + '?updateMask.fieldPaths=status&updateMask.fieldPaths=updatedAt', {
        method: 'PATCH',
        body: JSON.stringify(cancelData)
      });
      if (patchRes && patchRes.ok) {
        results.bookingDoc = { ok: true, status: patchRes.status };
      } else if (patchRes) {
        results.bookingDoc = { ok: false, status: patchRes.status, error: 'Patch failed' };
      } else {
        results.bookingDoc = { ok: false, error: 'No GCP token available' };
      }
    } catch(e) {
      results.bookingDoc = { ok: false, error: e.message };
    }

    // Also try direct fetch without token
    if (!results.bookingDoc || !results.bookingDoc.ok) {
      try {
        const directRes = await fetch(docUrl + '?updateMask.fieldPaths=status&updateMask.fieldPaths=updatedAt', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cancelData)
        });
        results.bookingDoc = { ok: directRes.ok, status: directRes.status, method: 'direct' };
      } catch(e) {
        if (!results.bookingDoc) results.bookingDoc = { ok: false, error: e.message };
      }
    }

    // Try to update appData/sync too
    try {
      const syncUrl = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT}/databases/(default)/documents/appData/sync`;
      const syncRes = await fetch(syncUrl);
      if (syncRes.ok) {
        const syncDoc = await syncRes.json();
        const bookings = firestoreValueToJS(syncDoc.fields.bookings) || [];
        const filtered = bookings.filter(function(b) { return b.bookingId !== bookingId; });
        const updateBody = {
          fields: {
            bookings: jsToFirestoreValue(filtered),
            _lastUpdated: { integerValue: String(Date.now()) }
          }
        };
        const updateRes = await firestoreFetch(syncUrl + '?updateMask.fieldPaths=bookings&updateMask.fieldPaths=_lastUpdated', {
          method: 'PATCH',
          body: JSON.stringify(updateBody)
        });
        results.syncDoc = updateRes ? { ok: updateRes.ok, status: updateRes.status } : { ok: false };
      } else {
        results.syncDoc = { status: syncRes.status, ok: false };
      }
    } catch(e) {
      results.syncDoc = { error: e.message };
    }

    return res.json({ success: true, action, bookingId, results });
  }

  if (action === 'findBooking') {
    const email = (body.email || '').trim().toLowerCase();
    if (!email) return res.json({ success: false, message: 'Missing email' });

    try {
      const bookingsUrl = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT}/databases/(default)/documents:runQuery`;
      const query = {
        structuredQuery: {
          from: [{ collectionId: 'bookings' }],
          where: {
            fieldFilter: {
              field: { fieldPath: 'email' },
              op: 'EQUAL',
              value: { stringValue: email }
            }
          }
        }
      };
      const qRes = await fetch(bookingsUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(query)
      });
      const qData = await qRes.json();
      if (qRes.ok && Array.isArray(qData)) {
        const docs = qData.filter(d => d.document).map(d => {
          const fields = d.document.fields || {};
          return {
            bookingId: firestoreValueToJS(fields.bookingId),
            email: firestoreValueToJS(fields.email),
            token: firestoreValueToJS(fields.token),
            status: firestoreValueToJS(fields.status),
            date: firestoreValueToJS(fields.date),
            docId: d.document.name.split('/').pop()
          };
        });
        return res.json({ success: true, bookings: docs });
      }
      return res.json({ success: true, bookings: [] });
    } catch(e) {
      return res.json({ success: false, message: e.message });
    }
  }

  return res.status(400).json({ success: false, message: 'Unknown action' });
};
