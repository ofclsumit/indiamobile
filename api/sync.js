const fs = require('fs');

const DATA_FILE = '/tmp/sync-data.json';

// --- Firestore REST API ---
const FIRESTORE_PROJECT = 'india-mobile-17134';
const FIRESTORE_DOC_PATH = 'appData/sync';
const FIRESTORE_URL = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT}/databases/(default)/documents/${FIRESTORE_DOC_PATH}`;

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

// --- /tmp file fallback ---
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
    // Try Firestore first, then /tmp fallback
    const firestoreData = await readFromFirestore();
    if (firestoreData) {
      // Also save to /tmp as cache
      saveData(firestoreData);
      return res.json(firestoreData);
    }
    return res.json(loadData());
  }

  if (req.method === 'POST') {
    // Read current data from Firestore (or /tmp)
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
    } else if (action === 'reset') {
      syncData = { bookings: [], token: 0, dates: [], activity: [], settings: [], otps: {}, cache: [], _lastUpdated: Date.now() };
    } else {
      ['bookings', 'token', 'dates', 'activity', 'settings', 'otps', 'cache'].forEach(k => {
        if (input[k] !== undefined) syncData[k] = input[k];
      });
    }

    syncData._lastUpdated = Date.now();

    // Write to both Firestore AND /tmp
    saveData(syncData);
    await writeToFirestore(syncData);

    return res.json({ success: true, data: syncData });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
