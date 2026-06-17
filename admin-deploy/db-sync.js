/* ============================================
   DB-SYNC — Firestore-backed real-time data sync
   ============================================ */

const DBSync = {
  _listeners: [],
  _pollId: null,
  _lastHash: null,
  _firestoreReady: false,
  _db: null,
  _unsubFirestore: null,
  API: 'https://indiamobileonline.vercel.app/api/sync',

  KEYS: {
    BOOKINGS: 'ds_bookings',
    TOKEN: 'ds_token',
    DATES: 'ds_dates',
    ACTIVITY: 'ds_activity',
    SETTINGS: 'ds_settings',
    CACHE: 'ds_cache',
  },

  FIRESTORE_DOC: 'appData/sync',

  // --- Initialize Firestore ---
  async initFirestore() {
    try {
      if (typeof firebase === 'undefined' || !firebase.firestore) {
        console.warn('[DBSync] Firebase/Firestore SDK not loaded, using API fallback');
        return false;
      }
      this._db = firebase.firestore();
      this._firestoreReady = true;
      console.log('[DBSync] Firestore initialized successfully');
      return true;
    } catch(e) {
      console.warn('[DBSync] Firestore init failed:', e);
      return false;
    }
  },

  // --- Start real-time Firestore listener ---
  startRealtimeListener() {
    if (!this._firestoreReady || !this._db) {
      console.warn('[DBSync] Firestore not ready, falling back to polling');
      this.startPolling(3000);
      return;
    }

    if (this._unsubFirestore) return; // Already listening

    const docRef = this._db.doc(this.FIRESTORE_DOC);
    this._unsubFirestore = docRef.onSnapshot((snapshot) => {
      if (!snapshot.exists) {
        console.log('[DBSync] No Firestore document yet');
        return;
      }
      const server = snapshot.data();
      let changed = false;
      const fields = {
        bookings: 'BOOKINGS', token: 'TOKEN', dates: 'DATES',
        activity: 'ACTIVITY', settings: 'SETTINGS', cache: 'CACHE'
      };

      for (const [key, kKey] of Object.entries(fields)) {
        if (server[key] === undefined) continue;
        const raw = JSON.stringify(server[key]);
        const local = localStorage.getItem(this.KEYS[kKey]);
        if (raw !== local) {
          localStorage.setItem(this.KEYS[kKey], raw);
          changed = true;
        }
      }

      if (changed) {
        this._lastHash = this._localHash();
        this._notify('firestore');
        console.log('[DBSync] Received real-time update from Firestore');
      }
    }, (error) => {
      console.error('[DBSync] Firestore listener error:', error);
      // Fall back to API polling
      this._unsubFirestore = null;
      this.startPolling(3000);
    });

    console.log('[DBSync] Real-time Firestore listener started');
  },

  stopRealtimeListener() {
    if (this._unsubFirestore) {
      this._unsubFirestore();
      this._unsubFirestore = null;
    }
  },

  // --- Read (local fallback) ---
  getBookings() {
    try { return JSON.parse(localStorage.getItem(this.KEYS.BOOKINGS)) || []; } catch(e) { return []; }
  },
  getCache() {
    try { return JSON.parse(localStorage.getItem(this.KEYS.CACHE)) || []; } catch(e) { return []; }
  },
  getToken() {
    return parseInt(localStorage.getItem(this.KEYS.TOKEN)) || 0;
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

  // --- Write (local + Firestore + API fallback) ---
  setBookings(val) {
    localStorage.setItem(this.KEYS.BOOKINGS, JSON.stringify(val));
    this._writeToFirestore({ bookings: val });
    this._notify('bookings');
  },
  setCache(val) {
    localStorage.setItem(this.KEYS.CACHE, JSON.stringify(val));
    this._writeToFirestore({ cache: val });
    this._notify('cache');
  },
  setToken(val) {
    localStorage.setItem(this.KEYS.TOKEN, val);
    this._writeToFirestore({ token: val });
    this._notify('token');
  },
  setDates(val) {
    localStorage.setItem(this.KEYS.DATES, JSON.stringify(val));
    this._writeToFirestore({ dates: val });
    this._notify('dates');
  },
  setActivity(val) {
    localStorage.setItem(this.KEYS.ACTIVITY, JSON.stringify(val));
    this._writeToFirestore({ activity: val });
    this._notify('activity');
  },
  setSettings(val) {
    localStorage.setItem(this.KEYS.SETTINGS, JSON.stringify(val));
    this._writeToFirestore({ settings: val });
    this._notify('settings');
  },

  // --- Firestore write ---
  async _writeToFirestore(data) {
    if (this._firestoreReady && this._db) {
      try {
        data._lastUpdated = Date.now();
        await this._db.doc(this.FIRESTORE_DOC).set(data, { merge: true });
      } catch(e) {
        console.warn('[DBSync] Firestore write failed, falling back to API:', e);
        this._syncToServer(data);
      }
    } else {
      // Fallback: sync via API
      const action = Object.keys(data)[0];
      const payload = { action: 'set' + action.charAt(0).toUpperCase() + action.slice(1) };
      payload[action] = data[action];
      this._syncToServer(payload);
    }
  },

  // --- API fallback sync ---
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
      cache: this.getCache(),
      source: source,
      timestamp: Date.now(),
    };
    this._listeners.forEach(fn => fn(data));
    document.dispatchEvent(new CustomEvent('db-sync', { detail: data }));
  },

  // --- Poll server for changes (fallback) ---
  startPolling(intervalMs) {
    if (this._pollId) return;
    this._lastHash = this._localHash();
    this._pollId = setInterval(() => this._poll(), intervalMs || 3000);
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
      activity: 'ACTIVITY', settings: 'SETTINGS', cache: 'CACHE'
    };

    for (const [key, kKey] of Object.entries(fields)) {
      if (server[key] === undefined) continue;
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
    const cache = this.getCache();
    return (bookings.length * 1000 + this.getToken()) + '_' + (bookings.map(b => b.status || '').join('')) + '_c' + (cache ? cache.length : 0);
  },

  async forceFetch() {
    // Try Firestore first
    if (this._firestoreReady && this._db) {
      try {
        const snap = await this._db.doc(this.FIRESTORE_DOC).get();
        if (snap.exists) {
          const server = snap.data();
          let changed = false;
          const fields = {
            bookings: 'BOOKINGS', token: 'TOKEN', dates: 'DATES',
            activity: 'ACTIVITY', settings: 'SETTINGS', cache: 'CACHE'
          };
          for (const [key, kKey] of Object.entries(fields)) {
            if (server[key] === undefined) continue;
            const raw = JSON.stringify(server[key]);
            const local = localStorage.getItem(this.KEYS[kKey]);
            if (raw !== local) {
              localStorage.setItem(this.KEYS[kKey], raw);
              changed = true;
            }
          }
          if (changed) {
            this._lastHash = this._localHash();
            this._notify('force');
          }
          return true;
        }
      } catch(e) {
        console.warn('[DBSync] Firestore forceFetch failed:', e);
      }
    }

    // Fallback to API
    const server = await this._fetchFromServer();
    if (!server) return false;
    let changed = false;
    const fields = {
      bookings: 'BOOKINGS', token: 'TOKEN', dates: 'DATES',
      activity: 'ACTIVITY', settings: 'SETTINGS', cache: 'CACHE'
    };
    for (const [key, kKey] of Object.entries(fields)) {
      if (server[key] === undefined) continue;
      const raw = JSON.stringify(server[key]);
      const local = localStorage.getItem(this.KEYS[kKey]);
      if (raw !== local) {
        localStorage.setItem(this.KEYS[kKey], raw);
        changed = true;
      }
    }
    if (changed) {
      this._lastHash = this._localHash();
      this._notify('force');
    }
    return true;
  },
};

// Listen for storage events from other tabs (same-origin fallback)
window.addEventListener('storage', (e) => {
  if (Object.values(DBSync.KEYS).includes(e.key)) {
    DBSync._notify(e.key === DBSync.KEYS.BOOKINGS ? 'bookings' : 'token');
  }
});

// Push local data to Firestore (called by app.js after data is ready)
DBSync.pushToServer = async function () {
  const bookings = this.getBookings();
  const token = this.getToken();
  const dates = this.getDates();
  const cache = this.getCache();

  if (this._firestoreReady && this._db) {
    const data = { _lastUpdated: Date.now() };
    if (bookings.length > 0) data.bookings = bookings;
    if (cache && cache.length > 0) data.cache = cache;
    if (token > 0) data.token = token;
    if (dates.length > 0) data.dates = dates;
    if (Object.keys(data).length > 1) {
      try {
        await this._db.doc(this.FIRESTORE_DOC).set(data, { merge: true });
        return;
      } catch(e) {
        console.warn('[DBSync] Firestore push failed, falling back to API');
      }
    }
  }

  // API fallback
  const tasks = [];
  if (bookings.length > 0) tasks.push(this._syncToServer({ action: 'setBookings', bookings }));
  if (cache && cache.length > 0) tasks.push(this._syncToServer({ action: 'setCache', cache }));
  if (token > 0) tasks.push(this._syncToServer({ action: 'setToken', token }));
  if (dates.length > 0) tasks.push(this._syncToServer({ action: 'setDates', dates }));
  if (tasks.length > 0) await Promise.all(tasks);
};

