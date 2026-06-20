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

function log() {
  var args = ['[ManageAPI]'].concat(Array.prototype.slice.call(arguments));
  console.log.apply(console, args);
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
  log('Action:', action);

  // Try Firebase Admin SDK first
  try {
    const admin = require('firebase-admin');
    const { getFirestore } = require('firebase-admin/firestore');
    if (admin.apps && admin.apps.length > 0) {
      log('Using existing Firebase Admin app');
    } else {
      log('Initializing Firebase Admin...');
      admin.initializeApp({ projectId: FIRESTORE_PROJECT });
    }
    const db = getFirestore();

    if (action === 'forceCancel') {
      const bookingId = body.bookingId || 'Zq539q2yM2kFULgxSvx3';
      const results = { bookingDoc: null, syncDoc: null };

      try {
        await db.collection('bookings').doc(bookingId).update({
          status: 'cancelled',
          updatedAt: new Date().toISOString()
        });
        results.bookingDoc = { ok: true };
        log('Cancelled booking doc:', bookingId);
      } catch(e) {
        results.bookingDoc = { ok: false, error: e.message };
        log('Failed to cancel booking doc:', e.message);
      }

      try {
        const syncRef = db.doc('appData/sync');
        const syncSnap = await syncRef.get();
        if (syncSnap.exists) {
          const syncData = syncSnap.data() || {};
          const bookings = syncData.bookings || [];
          const filtered = bookings.filter(function(b) { return b.bookingId !== bookingId; });
          await syncRef.update({ bookings: filtered, _lastUpdated: Date.now() });
          results.syncDoc = { ok: true, removed: bookings.length - filtered.length };
          log('Updated sync doc, removed', bookings.length - filtered.length, 'entries');
        } else {
          results.syncDoc = { ok: true, note: 'No sync doc' };
        }
      } catch(e) {
        results.syncDoc = { ok: false, error: e.message };
        log('Failed to update sync doc:', e.message);
      }

      return res.json({ success: true, action, bookingId, results });
    }

    if (action === 'updateStatus') {
      const bookingId = body.bookingId;
      const status = body.status;
      if (!bookingId || !status) return res.status(400).json({ success: false, message: 'Missing parameters' });
      
      const results = { bookingDoc: null, syncDoc: null };
      
      try {
        await db.collection('bookings').doc(bookingId).update({
          status: status,
          updatedAt: new Date().toISOString()
        });
        results.bookingDoc = { ok: true };
        log('Updated booking doc status:', bookingId, '->', status);
      } catch(e) {
        results.bookingDoc = { ok: false, error: e.message };
        log('Failed to update booking status:', e.message);
      }
      
      try {
        const syncRef = db.doc('appData/sync');
        const syncSnap = await syncRef.get();
        if (syncSnap.exists) {
          const syncData = syncSnap.data() || {};
          const bookings = syncData.bookings || [];
          bookings.forEach(b => {
            if (b.bookingId === bookingId) {
              b.status = status;
            }
          });
          await syncRef.update({ bookings: bookings, _lastUpdated: Date.now() });
          results.syncDoc = { ok: true };
          log('Updated sync doc booking status:', bookingId, '->', status);
        } else {
          results.syncDoc = { ok: true, note: 'No sync doc' };
        }
      } catch(e) {
        results.syncDoc = { ok: false, error: e.message };
        log('Failed to update sync doc:', e.message);
      }
      
      return res.json({ success: true, action, bookingId, status, results });
    }

    if (action === 'findBooking') {
      const email = (body.email || '').trim().toLowerCase();
      if (!email) return res.json({ success: false, message: 'Missing email' });

      const snap = await db.collection('bookings').where('email', '==', email).get();
      const docs = [];
      snap.forEach(function(doc) {
        docs.push({
          bookingId: doc.data().bookingId,
          email: doc.data().email,
          token: doc.data().token,
          status: doc.data().status,
          date: doc.data().date,
          docId: doc.id
        });
      });
      log('Found bookings:', docs.length);
      return res.json({ success: true, bookings: docs });
    }

    if (action === 'deleteAll') {
      const email = (body.email || '').trim().toLowerCase();
      const snap = await db.collection('bookings').where('email', '==', email).get();
      var count = 0;
      var batch = db.batch();
      snap.forEach(function(doc) {
        batch.delete(doc.ref);
        count++;
      });
      if (count > 0) await batch.commit();
      log('Deleted', count, 'bookings for', email);
      return res.json({ success: true, deleted: count });
    }

    return res.status(400).json({ success: false, message: 'Unknown action' });

  } catch(e) {
    log('Firebase Admin failed:', e.message);
    return res.status(500).json({ success: false, message: e.message });
  }
};
