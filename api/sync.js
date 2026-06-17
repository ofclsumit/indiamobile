const fs = require('fs');
const path = require('path');

const DATA_FILE = '/tmp/sync-data.json';

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error('Failed to load sync data:', e);
  }
  return {
    bookings: [],
    token: 0,
    dates: [],
    activity: [],
    settings: [],
    otps: {},
    _lastUpdated: Date.now(),
  };
}

function saveData(data) {
  try {
    data._lastUpdated = Date.now();
    fs.writeFileSync(DATA_FILE, JSON.stringify(data), 'utf8');
  } catch (e) {
    console.error('Failed to save sync data:', e);
  }
}

let syncData = loadData();
let lastPersist = Date.now();

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    syncData = loadData();
    return res.json(syncData);
  }

  if (req.method === 'POST') {
    syncData = loadData();
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
    } else {
      ['bookings', 'token', 'dates', 'activity', 'settings', 'otps'].forEach(k => {
        if (input[k] !== undefined) syncData[k] = input[k];
      });
    }

    saveData(syncData);
    return res.json({ success: true, data: syncData });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
