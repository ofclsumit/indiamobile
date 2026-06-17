let syncData = { bookings: [], token: 7, dates: [], activity: [], settings: [] };

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') return res.json(syncData);
  if (req.method === 'POST') {
    const input = req.body || {};
    const action = input.action || '';

    // Handle action-based updates from db-sync.js client
    if (action === 'setBookings' && input.bookings !== undefined) syncData.bookings = input.bookings;
    else if (action === 'setToken' && input.token !== undefined) syncData.token = input.token;
    else if (action === 'setDates' && input.dates !== undefined) syncData.dates = input.dates;
    else if (action === 'setActivity' && input.activity !== undefined) syncData.activity = input.activity;
    else if (action === 'setSettings' && input.settings !== undefined) syncData.settings = input.settings;
    else {
      // Fallback: accept direct key updates (legacy format)
      ['bookings', 'token', 'dates', 'activity', 'settings'].forEach(k => {
        if (input[k] !== undefined) syncData[k] = input[k];
      });
    }

    return res.json({ success: true, data: syncData });
  }
  return res.status(405).json({ error: 'Method not allowed' });
};