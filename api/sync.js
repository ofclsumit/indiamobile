const fs = require('fs');

const DATA_FILE = '/tmp/sync-data.json';

const FIRESTORE_PROJECT = 'india-mobile-17134';
const FIRESTORE_DOC_PATH = 'appData/sync';
const FIRESTORE_URL = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT}/databases/(default)/documents/${FIRESTORE_DOC_PATH}`;
const QUEUE_CURRENT_URL = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT}/databases/(default)/documents/queue/current`;
const COUNTER_URL = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT}/databases/(default)/documents/counters/tokenCounter`;
const BOOKINGS_COLL_URL = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT}/databases/(default)/documents/bookings`;
const HISTORY_COLL_URL = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT}/databases/(default)/documents/booking_history`;

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

function jsToFirestoreDocument(val) {
  const fields = {};
  for (const [k, v] of Object.entries(val)) {
    fields[k] = jsToFirestoreValue(v);
  }
  return { fields };
}

async function readFromFirestore() {
  try {
    const res = await fetch(FIRESTORE_URL);
    if (!res.ok) return null;
    const doc = await res.json();
    if (!doc.fields) return null;
    const data = {};
    for (const [k, v] of Object.entries(doc.fields)) {
      data[k] = firestoreValueToJS(v);
    }
    return data;
  } catch (e) {
    return null;
  }
}

async function writeToFirestore(data) {
  try {
    const fields = {};
    for (const [k, v] of Object.entries(data)) {
      fields[k] = jsToFirestoreValue(v);
    }
    const updateMask = Object.keys(data).map(k => `updateMask.fieldPaths=${k}`).join('&');
    const url = FIRESTORE_URL + '?' + updateMask;
    await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields })
    });
  } catch (e) {
    console.error('Firestore write error:', e);
  }
}

async function archiveBookingsToFirestore(bookings, archivedBy) {
  var timestamp = new Date().toISOString();
  var archiveMeta = {
    archivedAt: timestamp,
    archivedBy: archivedBy || 'system',
    archiveReason: 'System Reset'
  };

  // Archive each booking individually in booking_history collection
  for (var i = 0; i < bookings.length; i++) {
    var b = bookings[i];
    if (!b.bookingId) continue;
    try {
      var docData = Object.assign({}, b, archiveMeta);
      var body = jsToFirestoreDocument(docData);
      await fetch(HISTORY_COLL_URL + '/' + b.bookingId, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
    } catch(e) {
      console.warn('[Archive] Failed to archive booking ' + (b.bookingId || 'unknown') + ':', e);
    }
  }

  // Also archive as a batch array in appData/archive
  try {
    var archiveUrl = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT}/databases/(default)/documents/appData/archive`;
    var archiveBody = {
      fields: {
        bookings: jsToFirestoreValue(bookings),
        archivedAt: { stringValue: timestamp },
        archivedBy: { stringValue: archivedBy || 'system' },
        archiveReason: { stringValue: 'System Reset' }
      }
    };
    await fetch(archiveUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(archiveBody)
    });
  } catch(e) {
    console.warn('[Archive] Failed to write batch archive:', e);
  }
}

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      return JSON.parse(raw);
    }
  } catch (e) {}
  return {
    bookings: [],
    token: 0,
    dates: [],
    activity: [],
    settings: [],
    otps: {},
    cache: [],
    customers: [],
    _lastUpdated: Date.now(),
  };
}

function saveData(data) {
  try {
    data._lastUpdated = Date.now();
    fs.writeFileSync(DATA_FILE, JSON.stringify(data), 'utf8');
  } catch (e) {}
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    const firestoreData = await readFromFirestore();
    if (firestoreData) {
      saveData(firestoreData);
      return res.json(firestoreData);
    }
    return res.json(loadData());
  }

  if (req.method === 'POST') {
    let syncData = await readFromFirestore() || loadData();
    const input = req.body || {};
    const action = input.action || '';

    if (action === 'setBookings' && input.bookings !== undefined) {
      syncData.bookings = input.bookings;
    } else if (action === 'setToken' && input.token !== undefined) {
      syncData.token = input.token;
    } else if (action === 'setDates' && input.dates !== undefined) {
      syncData.dates = input.dates;
    } else if (action === 'setActivity' && input.activity !== undefined) {
      syncData.activity = input.activity;
    } else if (action === 'setSettings' && input.settings !== undefined) {
      syncData.settings = input.settings;
    } else if (action === 'setCache' && input.cache !== undefined) {
      syncData.cache = input.cache;
    } else if (action === 'setCustomers' && input.customers !== undefined) {
      syncData.customers = input.customers;
    } else if (action === 'reset' || action === 'archiveAndReset') {
      // Archive existing bookings
      var archivedBy = input.adminEmail || 'system';
      try {
        await archiveBookingsToFirestore(syncData.bookings || [], archivedBy);
      } catch(e) {
        console.error('[Reset] Archive failed:', e);
      }
      syncData = { bookings: [], token: 0, dates: [], activity: [], settings: [], otps: {}, cache: [], customers: (input.keepCustomers ? syncData.customers : []), _lastUpdated: Date.now() };
      // Reset counter to 0
      try {
        var counterFields = { lastToken: { integerValue: '0' } };
        await fetch(COUNTER_URL + '?updateMask.fieldPaths=lastToken', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fields: counterFields })
        });
      } catch(e) { console.error('Counter reset error:', e); }
    } else if (action === 'resetExceptCustomers') {
      try {
        await archiveBookingsToFirestore(syncData.bookings || [], archivedBy || 'system');
      } catch(e) {}
      const keptCustomers = syncData.customers || [];
      syncData = { bookings: [], token: 0, dates: [], activity: [], settings: [], otps: {}, cache: [], customers: keptCustomers, _lastUpdated: Date.now() };
      try {
        var counterFields = { lastToken: { integerValue: '0' } };
        await fetch(COUNTER_URL + '?updateMask.fieldPaths=lastToken', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fields: counterFields })
        });
      } catch(e) { console.error('Counter reset error:', e); }
    } else {
      ['bookings', 'token', 'dates', 'activity', 'settings', 'otps', 'cache', 'customers'].forEach(k => {
        if (input[k] !== undefined) syncData[k] = input[k];
      });
    }

    syncData._lastUpdated = Date.now();

    saveData(syncData);
    await writeToFirestore(syncData);

    if (input.token !== undefined) {
      var tokenVal = input.token;
      try {
        var qFields = { currentToken: { integerValue: String(Math.max(0, parseInt(tokenVal) || 0)) } };
        await fetch(QUEUE_CURRENT_URL + '?updateMask.fieldPaths=currentToken', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fields: qFields })
        });
      } catch(e) { console.error('Queue/current sync error:', e); }
    }

    return res.json({ success: true, data: syncData });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
