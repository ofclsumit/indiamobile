const admin = require('firebase-admin');

let db = null;
async function getDb() {
  if (db) return db;
  try {
    if (!admin.apps.length) {
      await admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        projectId: 'india-mobile-17134'
      });
    }
    db = admin.firestore();
    console.log('[ManageAPI] Firebase Admin initialized with ADC');
  } catch(e) {
    console.warn('[ManageAPI] ADC failed, trying without:', e.message);
    if (!admin.apps.length) {
      admin.initializeApp({ projectId: 'india-mobile-17134' });
    }
    db = admin.firestore();
  }
  return db;
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

  try {
    const database = await getDb();

    if (action === 'forceCancel') {
      const bookingId = body.bookingId || 'Zq539q2yM2kFULgxSvx3';
      const results = { bookingDoc: null, syncDoc: null };

      // Cancel the individual booking document
      try {
        await database.collection('bookings').doc(bookingId).update({
          status: 'cancelled',
          updatedAt: new Date().toISOString()
        });
        results.bookingDoc = { ok: true };
      } catch(e) {
        results.bookingDoc = { ok: false, error: e.message };
      }

      // Also remove from appData/sync if present
      try {
        const syncRef = database.doc('appData/sync');
        const syncSnap = await syncRef.get();
        if (syncSnap.exists) {
          const syncData = syncSnap.data() || {};
          const bookings = syncData.bookings || [];
          const filtered = bookings.filter(function(b) { return b.bookingId !== bookingId; });
          await syncRef.update({ bookings: filtered, _lastUpdated: Date.now() });
          results.syncDoc = { ok: true, removed: bookings.length - filtered.length };
        } else {
          results.syncDoc = { ok: true, note: 'No sync doc' };
        }
      } catch(e) {
        results.syncDoc = { ok: false, error: e.message };
      }

      return res.json({ success: true, action, bookingId, results });
    }

    if (action === 'findBooking') {
      const email = (body.email || '').trim().toLowerCase();
      if (!email) return res.json({ success: false, message: 'Missing email' });

      const snap = await database.collection('bookings')
        .where('email', '==', email)
        .get();

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

      return res.json({ success: true, bookings: docs });
    }

    return res.status(400).json({ success: false, message: 'Unknown action' });
  } catch(e) {
    return res.json({ success: false, message: e.message });
  }
};
