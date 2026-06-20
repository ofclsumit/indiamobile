const FIRESTORE_PROJECT = 'india-mobile-17134';

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

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = req.body || {};
  const action = body.action || '';

  if (action === 'cancelBooking') {
    const bookingId = body.bookingId;
    if (!bookingId) return res.json({ success: false, message: 'Missing bookingId' });

    const results = { bookingDoc: null, syncDoc: null };

    // 1. Update the individual booking document in /bookings collection
    try {
      const docUrl = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT}/databases/(default)/documents/bookings/${bookingId}`;
      const cancelData = {
        fields: {
          status: { stringValue: 'cancelled' },
          updatedAt: { stringValue: new Date().toISOString() }
        }
      };
      const docRes = await fetch(docUrl + '?updateMask.fieldPaths=status&updateMask.fieldPaths=updatedAt', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cancelData)
      });
      results.bookingDoc = { status: docRes.status, ok: docRes.ok };
    } catch(e) {
      results.bookingDoc = { error: e.message };
    }

    // 2. Remove from appData/sync if present
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
        const updateRes = await fetch(syncUrl + '?updateMask.fieldPaths=bookings&updateMask.fieldPaths=_lastUpdated', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updateBody)
        });
        results.syncDoc = { status: updateRes.status, ok: updateRes.ok };
      } else {
        results.syncDoc = { status: syncRes.status, ok: false };
      }
    } catch(e) {
      results.syncDoc = { error: e.message };
    }

    return res.json({ success: true, action: 'cancelBooking', bookingId, results });
  }

  if (action === 'deleteBooking') {
    const bookingId = body.bookingId;
    if (!bookingId) return res.json({ success: false, message: 'Missing bookingId' });

    const results = { bookingDoc: null, syncDoc: null };

    // 1. Delete from /bookings collection
    try {
      const docUrl = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT}/databases/(default)/documents/bookings/${bookingId}`;
      const docRes = await fetch(docUrl, { method: 'DELETE' });
      results.bookingDoc = { status: docRes.status, ok: docRes.ok };
    } catch(e) {
      results.bookingDoc = { error: e.message };
    }

    // 2. Remove from appData/sync
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
        const updateRes = await fetch(syncUrl + '?updateMask.fieldPaths=bookings&updateMask.fieldPaths=_lastUpdated', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updateBody)
        });
        results.syncDoc = { status: updateRes.status, ok: updateRes.ok };
      } else {
        results.syncDoc = { status: syncRes.status, ok: false };
      }
    } catch(e) {
      results.syncDoc = { error: e.message };
    }

    return res.json({ success: true, action: 'deleteBooking', bookingId, results });
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

  return res.status(400).json({ success: false, message: 'Unknown action. Use: cancelBooking, deleteBooking, findBooking' });
};
