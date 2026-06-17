/* ============================================
   DB-SYNC — Real-time data sync layer (shared API)
   ============================================ */

const DBSync = {
  _listeners: [],
  _pollId: null,
  _lastHash: null,
  API: '/api/sync',

  KEYS: {
    BOOKINGS: 'ds_bookings',
    TOKEN: 'ds_token',
    DATES: 'ds_dates',
    ACTIVITY: 'ds_activity',
    SETTINGS: 'ds_settings',
  },

  // --- Read (local fallback) ---
  getBookings() {
    try { return JSON.parse(localStorage.getItem(this.KEYS.BOOKINGS)) || []; } catch(e) { return []; }
  },
  getToken() {
    return parseInt(localStorage.getItem(this.KEYS.TOKEN)) || 7;
  },
  getDates() {
    try { return JSON.parse(localStorage.getItem(this.KEYS.DATES)) || []; } catch(e) { return []; }
  },
  getActivity() {
    try { return JSON.parse(localStorage.getItem(this.KEYS.ACTIVITY)) || []; } catch(e) { return []; }
  },
  getSettings() {
    try { return JSON.parse(localStorage.getItem(this.KEYS.SETTINGS)) || {}; } catch(e) { return {}; }
  },

  // --- Write (local + server sync) ---
  setBookings(val) {
    localStorage.setItem(this.KEYS.BOOKINGS, JSON.stringify(val));
    this._syncToServer({ action: 'setBookings', bookings: val });
    this._notify('bookings');
  },
  setToken(val) {
    localStorage.setItem(this.KEYS.TOKEN, val);
    this._syncToServer({ action: 'setToken', token: val });
    this._notify('token');
  },
  setDates(val) {
    localStorage.setItem(this.KEYS.DATES, JSON.stringify(val));
    this._syncToServer({ action: 'setDates', dates: val });
    this._notify('dates');
  },
  setActivity(val) {
    localStorage.setItem(this.KEYS.ACTIVITY, JSON.stringify(val));
    this._syncToServer({ action: 'setActivity', activity: val });
    this._notify('activity');
  },
  setSettings(val) {
    localStorage.setItem(this.KEYS.SETTINGS, JSON.stringify(val));
    this._syncToServer({ action: 'setSettings', settings: val });
    this._notify('settings');
  },

  // --- Server sync ---
  async _syncToServer(payload) {
    try {
      await fetch(this.API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch(e) { /* silent */ }
  },

  async _fetchFromServer() {
    try {
      const res = await fetch(this.API);
      if (!res.ok) return null;
      return await res.json();
    } catch(e) { return null; }
  },

  // --- Subscribe ---
  subscribe(fn) {
    this._listeners.push(fn);
    return () => { this._listeners = this._listeners.filter(l => l !== fn); };
  },

  _notify(source) {
    const data = {
      bookings: this.getBookings(),
      token: this.getToken(),
      dates: this.getDates(),
      activity: this.getActivity(),
      settings: this.getSettings(),
      source: source,
      timestamp: Date.now(),
    };
    this._listeners.forEach(fn => fn(data));
    document.dispatchEvent(new CustomEvent('db-sync', { detail: data }));
  },

  // --- Poll server for changes ---
  startPolling(intervalMs) {
    if (this._pollId) return;
    this._lastHash = this._localHash();
    this._pollId = setInterval(() => this._poll(), intervalMs || 2000);
  },

  stopPolling() {
    if (this._pollId) { clearInterval(this._pollId); this._pollId = null; }
  },

  async _poll() {
    const server = await this._fetchFromServer();
    if (!server) return;

    let changed = false;
    const fields = {
      bookings: 'BOOKINGS', token: 'TOKEN', dates: 'DATES',
      activity: 'ACTIVITY', settings: 'SETTINGS'
    };

    for (const [key, kKey] of Object.entries(fields)) {
      const raw = JSON.stringify(server[key]);
      const local = localStorage.getItem(this.KEYS[kKey]);
      if (raw !== local) {
        localStorage.setItem(this.KEYS[kKey], raw);
        changed = true;
      }
    }

    if (changed) {
      this._lastHash = this._localHash();
      this._notify('poll');
    }
  },

  _localHash() {
    const bookings = this.getBookings();
    return (bookings.length * 1000 + this.getToken()) + '_' + (bookings.map(b => b.status || '').join(''));
  },
};

// Listen for storage events from other tabs (same-origin fallback)
window.addEventListener('storage', (e) => {
  if (Object.values(DBSync.KEYS).includes(e.key)) {
    DBSync._notify(e.key === DBSync.KEYS.BOOKINGS ? 'bookings' : 'token');
  }
});

// Auto-start polling
DBSync.startPolling();

// Seed shared data from local storage if server is empty

