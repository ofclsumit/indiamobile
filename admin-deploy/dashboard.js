/* ============================================
   DASHBOARD — Operations Management
   ============================================ */

// ============================================
// STATE
// ============================================
let bookingsSortField = 'token';
let bookingsSortDir = 'asc';
let bookingsPage = 1;
let completedSortField = 'date';
let completedSortDir = 'desc';
let completedPage = 1;
const PAGE_SIZE = 10;

let calViewDate = new Date();
let queuePaused = false;
let activityLog = [];
let charts = {};
let _refreshTimer = null;
let _activeSection = 'overview';

// ============================================
// CLOCK
// ============================================
function startDigitalClock() {
  const clockEl = document.getElementById('digitalClockDisplay');
  const dateEl = document.getElementById('currentDateDisplay');
  
  function updateTime() {
    const now = new Date();
    if (clockEl) {
      clockEl.textContent = now.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      });
    }
    if (dateEl) {
      dateEl.textContent = now.toLocaleDateString('en-IN', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });
    }
  }
  
  updateTime();
  setInterval(updateTime, 1000);
}

// ============================================
// CONTEXTUAL REFRESH
// ============================================
async function refreshActiveSection() {
  const refreshBtn = document.querySelector('.db-topnav-btn i.fa-rotate');
  if (refreshBtn) refreshBtn.classList.add('fa-spin');
  try {
    if (_activeSection === 'overview') refreshDashboard();
    else if (_activeSection === 'bookings') renderBookingsTable();
    else if (_activeSection === 'completed') renderCompletedBookings();
    else if (_activeSection === 'queuecontrol') refreshQueueControl();
    else if (_activeSection === 'calendar') renderCalendar();
    else if (_activeSection === 'customers') renderCustomers();
    else if (_activeSection === 'activity') renderActivity();
    else if (_activeSection === 'admins') renderAdmins();
  } catch(e) {
    console.warn('[Refresh] Error:', e);
  } finally {
    if (refreshBtn) {
      setTimeout(() => refreshBtn.classList.remove('fa-spin'), 200);
    }
  }
}

// ============================================
// AUTH STATE
// ============================================
let currentAdmin = null;

function signInWithGoogle() {
  var provider = new firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  firebase.auth().signInWithPopup(provider).catch(function(error) {
    var el = document.getElementById('loginError');
    if (!el) return;
    el.style.display = 'block';
    if (error.code === 'auth/unauthorized-domain') {
      el.textContent = 'This domain is not authorized. Go to Firebase Console → Authentication → Settings → Authorized domains, and add "' + window.location.hostname + '".';
    } else if (error.code === 'auth/popup-blocked') {
      el.textContent = 'Popup was blocked. Please allow popups for this site and try again.';
    } else if (error.code === 'auth/popup-closed-by-user') {
      el.textContent = '';
      el.style.display = 'none';
      return;
    } else {
      el.textContent = 'Sign-in failed: ' + error.message;
    }
  });
}

function signOutAdmin() {
  if (currentAdmin) logActivity('Admin Logout: ' + (currentAdmin.displayName || currentAdmin.email), '--', 'Info');
  firebase.auth().signOut().catch(function() {});
}

function handleAuthState(user) {
  var loginEl = document.getElementById('loginScreen');
  var dashEl = document.getElementById('dashboardApp');
  var errEl = document.getElementById('loginError');
  if (!loginEl || !dashEl) return;

  if (user) {
    var email = user.email;
    if (!email) {
      firebase.auth().signOut();
      return;
    }

    var db = firebase.firestore();
    var adminsRef = db.collection('admins');

    adminsRef.doc(email).get().then(function(doc) {
      if (doc.exists) {
        currentAdmin = user;
        if (errEl) errEl.style.display = 'none';
        loginEl.style.display = 'none';
        dashEl.style.display = null;
        document.getElementById('adminNameDisplay').textContent = user.displayName || email;
        document.getElementById('adminEmailDisplay').textContent = email;
        var avatar = document.getElementById('adminAvatar');
        if (avatar && user.photoURL) { avatar.src = user.photoURL; avatar.style.display = 'inline'; }
        var dAvatar = document.getElementById('dropdownAvatar');
        if (dAvatar) { dAvatar.src = user.photoURL || ''; }
        var dName = document.getElementById('dropdownUserName');
        if (dName) dName.textContent = user.displayName || email;
        var dEmail = document.getElementById('dropdownUserEmail');
        if (dEmail) dEmail.textContent = email;
        renderAdmins();
        initDBSync();
        fullRefresh();
        logActivity('Admin Login: ' + (user.displayName || email), '--', 'Info');
      } else {
        // Not in admins list — check if this could be the first admin bootstrap
        adminsRef.limit(1).get().then(function(snap) {
          if (snap.empty) {
            // First admin — auto-bootstrap
            adminsRef.doc(email).set({ role: 'owner', added: new Date().toISOString() }).then(function() {
              currentAdmin = user;
              if (errEl) errEl.style.display = 'none';
              loginEl.style.display = 'none';
              dashEl.style.display = null;
              document.getElementById('adminNameDisplay').textContent = user.displayName || email;
              document.getElementById('adminEmailDisplay').textContent = email;
              var avatar2 = document.getElementById('adminAvatar');
              if (avatar2 && user.photoURL) { avatar2.src = user.photoURL; avatar2.style.display = 'inline'; }
              var dAvatar2 = document.getElementById('dropdownAvatar');
              if (dAvatar2) { dAvatar2.src = user.photoURL || ''; }
              var dName2 = document.getElementById('dropdownUserName');
              if (dName2) dName2.textContent = user.displayName || email;
              var dEmail2 = document.getElementById('dropdownUserEmail');
              if (dEmail2) dEmail2.textContent = email;
              renderAdmins();
              initDBSync();
              fullRefresh();
              logActivity('Admin Login (first admin): ' + (user.displayName || email), '--', 'Info');
              notify('You have been auto-authorized as the first admin (owner).', 'success');
            }).catch(function(err) {
              console.error('[Auth] Bootstrap set failed:', err);
              firebase.auth().signOut();
              if (errEl) { errEl.style.display = 'block'; errEl.textContent = 'Could not create admin record: ' + (err.message || 'Firestore write denied. Check your Firestore security rules.'); }
            });
          } else {
            firebase.auth().signOut();
            if (errEl) { errEl.style.display = 'block'; errEl.textContent = 'This Google account is not authorized for admin access.'; }
          }
        }).catch(function(err) {
          console.error('[Auth] Bootstrap list check failed:', err);
          firebase.auth().signOut();
          if (errEl) { errEl.style.display = 'block'; errEl.textContent = 'Could not check admin list: ' + (err.message || 'Firestore list denied. Check your Firestore security rules.'); }
        });
      }
    }).catch(function(err) {
      console.error('[Auth] Admin doc read failed:', err);
      if (errEl) { errEl.style.display = 'block'; errEl.textContent = 'Could not verify admin access: ' + (err.message || 'Firestore error. Check your Firestore security rules in the Firebase Console → Firestore → Rules tab.'); }
    });
  } else {
    currentAdmin = null;
    loginEl.style.display = 'flex';
    dashEl.style.display = 'none';
  }
}

function initDBSync() {
  DBSync.subscribe(function(data) { debouncedRefresh(data); });
  DBSync.initFirestore().then(function(ok) {
    if (ok) {
      DBSync.startRealtimeListener();
      DBSync.forceFetch().then(function() { fullRefresh(); });
    } else {
      DBSync.forceFetch().then(function() {
        DBSync.startPolling(3000);
        fullRefresh();
      });
    }
    // Also listen to /bookings collection directly for bookings created via API
    if (window.__bookingsRef) {
      window.__bookingsRef.onSnapshot(function(snap) {
        var all = [];
        snap.forEach(function(doc) { all.push({ id: doc.id, ...doc.data() }); });
        if (all.length > 0) {
          var merged = DBSync.getBookings();
          all.forEach(function(nb) {
            var idx = merged.findIndex(function(b) { return b.bookingId === nb.bookingId; });
            if (idx >= 0) merged[idx] = nb;
            else merged.push(nb);
          });
          DBSync.setBookings(merged);
        }
      }, function() {});
    }
  });
}

// ============================================
// INIT
// ============================================
document.addEventListener('DOMContentLoaded', function() {
  document.getElementById('currentDateDisplay').textContent = new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  startDigitalClock();
  loadActivityLog();
  loadNotifications();
  _prevBookingCount = DBSync.getBookings().length;

  if (window.innerWidth <= 768) document.getElementById('menuBtn').style.display = 'flex';
  window.addEventListener('resize', function() {
    document.getElementById('menuBtn').style.display = window.innerWidth <= 768 ? 'flex' : 'none';
  });

  firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL).then(function() {
    firebase.auth().onAuthStateChanged(handleAuthState);
  }).catch(function() {
    firebase.auth().onAuthStateChanged(handleAuthState);
  });
});

async function fullRefresh() {
  await DBSync.forceFetch();
  refreshDashboard();
  renderBookingsTable();
  renderCompletedBookings();
  renderCalendar();
  renderCustomers();
  renderActivity();
  renderAdmins();
  renderNotifications();
  refreshQueueControl();
}

let _prevBookingCount = 0;
let _tokenAvailability = { available: 0, remaining: 0, nextDate: '' };

function debouncedRefresh(data) {
  if (_refreshTimer) { clearTimeout(_refreshTimer); _refreshTimer = null; }
  _refreshTimer = setTimeout(async () => {
    _refreshTimer = null;

    if (data.source !== 'force') {
      await DBSync.forceFetch();
    }

    const bookings = DBSync.getBookings();

    if (_prevBookingCount > 0 && bookings.length > _prevBookingCount) {
      const newCount = bookings.length - _prevBookingCount;
      notifications.unshift({ id: Date.now(), text: newCount + ' new booking(s) received', time: new Date().toLocaleString(), type: 'info', read: false });
      if (notifications.length > 100) notifications = notifications.slice(0, 100);
      saveNotifications();
      updateNotifBadge();
      if (document.getElementById('section-notifications')?.classList.contains('active')) renderNotifications();
    }
    _prevBookingCount = bookings.length;

    refreshQueueControl();
    if (document.getElementById('section-overview')?.classList.contains('active')) refreshDashboard();
    if (document.getElementById('section-bookings')?.classList.contains('active')) renderBookingsTable();
    if (document.getElementById('section-completed')?.classList.contains('active')) renderCompletedBookings();
    if (document.getElementById('section-queuecontrol')?.classList.contains('active')) refreshQueueControl();
    if (document.getElementById('section-calendar')?.classList.contains('active')) renderCalendar();
    if (document.getElementById('section-customers')?.classList.contains('active')) renderCustomers();
    if (document.getElementById('section-activity')?.classList.contains('active')) renderActivity();
  }, 100);
}

// ============================================
// SECTION SWITCHING
// ============================================
async function switchSection(id, el, type) {
  document.querySelectorAll('.db-section').forEach(s => s.classList.remove('active'));
  document.getElementById('section-' + id).classList.add('active');

  document.querySelectorAll('.db-sidebar-item').forEach(i => i.classList.remove('active'));
  document.querySelectorAll('.db-mobile-nav-item').forEach(i => i.classList.remove('active'));

  if (el) el.classList.add('active');

  _activeSection = id;

  await DBSync.forceFetch();

  if (id === 'overview') refreshDashboard();
  if (id === 'bookings') renderBookingsTable();
  if (id === 'completed') renderCompletedBookings();
  if (id === 'queuecontrol') refreshQueueControl();
  if (id === 'calendar') renderCalendar();
  if (id === 'customers') renderCustomers();
  if (id === 'activity') renderActivity();
  if (id === 'notifications') renderNotifications();

  if (window.innerWidth <= 768) closeSidebar();
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebarOverlay').classList.toggle('open');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('open');
}

// ============================================
// GLOBAL SEARCH
// ============================================
function globalSearchHandler(q) {
  if (q.length < 2) return;
  const bookings = DBSync.getBookings();
  const results = bookings.filter(b =>
    b.name?.toLowerCase().includes(q.toLowerCase()) ||
    b.email?.toLowerCase().includes(q.toLowerCase()) ||
    b.bookingId?.toLowerCase().includes(q) ||
    b.token?.includes(q)
  );
  if (results.length > 0) {
    switchSection('bookings', document.querySelector('[data-section=bookings]'));
    document.getElementById('bookingsSearch').value = q;
    renderBookingsTable();
  }
}

function getToday() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
function refreshDashboard() {
  const bookings = DBSync.getBookings();
  const today = getToday();
  const todayBookings = bookings.filter(b => b.date === today);

  document.getElementById('kpiTodayBookings').textContent = todayBookings.length;

  const pending = todayBookings.filter(b => b.status === 'pending' || b.status === 'approved' || b.status === 'processing');
  const completed = todayBookings.filter(b => b.status === 'completed');
  const cancelled = todayBookings.filter(b => b.status === 'cancelled');

  document.getElementById('kpiPending').textContent = pending.length;
  document.getElementById('kpiCompleted').textContent = completed.length;
  document.getElementById('kpiCancelled').textContent = cancelled.length;

  document.querySelectorAll('.db-card').forEach(c => { c.classList.remove('live-update'); void c.offsetWidth; c.classList.add('live-update'); });

  // Update token availability
  const av = calcTokenAvailability();
  if (av.nextDate) {
    document.getElementById('kpiNextServing').textContent = av.nextLabel;
    document.getElementById('kpiTokenAvail').textContent = av.remaining + '/' + av.available + ' remaining';
  } else {
    document.getElementById('kpiNextServing').textContent = '--';
    document.getElementById('kpiTokenAvail').textContent = 'No upcoming serving day';
  }
}

function calcTokenAvailability() {
  const bookings = DBSync.getBookings();
  const today = new Date();
  today.setHours(0,0,0,0);
  const targetDays = [2, 5];
  const dailyCap = parseInt(document.getElementById('calDailyCap')?.value) || 50;
  const todayStr = getToday();

  let nextDate = null;
  for (let i = 0; i <= 14; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    if (targetDays.includes(d.getDay())) { nextDate = d; break; }
  }

  if (!nextDate) return { available: 0, remaining: 0, nextDate: '', nextLabel: '' };

  const nextStr = nextDate.getFullYear() + '-' + String(nextDate.getMonth()+1).padStart(2,'0') + '-' + String(nextDate.getDate()).padStart(2,'0');
  const booked = bookings.filter(b => b.date === nextStr && b.status !== 'cancelled').length;
  const remaining = Math.max(0, dailyCap - booked);
  const nextLabel = nextDate.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });

  return { available: dailyCap, remaining, nextDate: nextStr, nextLabel, booked };
}

// ============================================
// QUEUE TABLE
// ============================================
// ============================================
// QUEUE CONTROL
// ============================================
// QUEUE CONTROL
// ============================================
function refreshQueueControl() {
  const bookings = DBSync.getBookings();
  const today = getToday();
  const currentToken = DBSync.getToken();

  const currentBooking = bookings.find(b => parseInt(b.token) === currentToken);

  document.getElementById('qcCurrentToken').textContent = String(currentToken).padStart(2, '0');
  document.getElementById('qcCurrentInfo').textContent = currentBooking
    ? `${currentBooking.name || 'N/A'} — ${currentBooking.service || 'N/A'}`
    : 'No active token';
}



async function startToken() {
  const currentToken = DBSync.getToken();
  if (currentToken > 0) {
    const key = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    sessionStorage.setItem('qc_auth', key);
    window.open('queue-control.html?key=' + key, '_blank');
    return;
  }
  const bookings = DBSync.getBookings();
  const waiting = bookings.filter(b => b.status === 'approved' || b.status === 'pending' || b.status === 'waiting');
  waiting.sort((a, b) => parseInt(a.token) - parseInt(b.token));
  if (waiting.length === 0) { notify('No bookings waiting to start the queue.', 'error'); return; }
  const first = waiting[0];
  if (!(await showConfirmModal('Start queue at Token #' + String(first.token).padStart(2, '0') + ' (' + (first.name || 'Customer') + ')?'))) return;
  DBSync.setToken(parseInt(first.token));
  logActivity('Started Queue', first.token, 'Success');
  notify('Queue started at Token #' + String(first.token).padStart(2, '0'), 'success');
  refreshQueueControl();
  refreshDashboard();
  const key = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  sessionStorage.setItem('qc_auth', key);
  const qcWin = window.open('queue-control.html?key=' + key, '_blank');
}

async function queueCallNext() {
  const bookings = DBSync.getBookings();
  const today = getToday();
  const waiting = bookings.filter(b => b.date === today && (b.status === 'approved' || b.status === 'pending' || b.status === 'waiting'));
  waiting.sort((a, b) => parseInt(a.token) - parseInt(b.token));

  if (waiting.length === 0) { notify('No customers waiting in queue.', 'error'); return; }

  const next = waiting[0];
  if (!(await showConfirmModal('Call next token #' + String(next.token).padStart(2, '0') + ' for ' + (next.name || 'Customer') + '?'))) return;
  next.status = 'processing';
  DBSync.setBookings(bookings);
  syncBookingStatusToFirestore(next);
  DBSync.setToken(parseInt(next.token));

  logActivity('Called Next Token', next.token, 'Success');
  notify('Called Token #' + next.token + ' — ' + (next.name || 'Customer'), 'success');
  refreshQueueControl();
  refreshDashboard();
}

async function queueMarkComplete() {
  const bookings = DBSync.getBookings();
  const currentToken = DBSync.getToken();
  const booking = bookings.find(b => parseInt(b.token) === currentToken && (b.status === 'processing' || b.status === 'approved' || b.status === 'waiting'));

  if (!booking) { notify('No active token to mark as completed.', 'error'); return; }
  if (!(await showConfirmModal('Mark token #' + String(currentToken).padStart(2, '0') + ' (' + (booking.name || 'Customer') + ') as completed?'))) return;

  booking.status = 'completed';
  DBSync.setBookings(bookings);
  syncBookingStatusToFirestore(booking);

  logActivity('Marked Completed', currentToken, 'Success');
  notify('Token #' + String(currentToken).padStart(2, '0') + ' marked as completed.', 'success');
  refreshQueueControl();
  refreshDashboard();
}

async function queueSkip() {
  const bookings = DBSync.getBookings();
  const today = getToday();
  const processing = bookings.find(b => b.date === today && b.status === 'processing');

  if (!processing) { notify('No customer currently being served.', 'error'); return; }
  if (!(await showConfirmModal('Skip token #' + String(processing.token).padStart(2, '0') + ' (' + (processing.name || 'Customer') + ')? They will be moved to end of queue.'))) return;

  processing.status = 'approved'; // Put back to waiting
  DBSync.setBookings(bookings);
  syncBookingStatusToFirestore(processing);

  logActivity('Skipped Token', processing.token, 'Success');
  notify('Token #' + processing.token + ' skipped and moved to end of queue.', 'warning');
  refreshQueueControl();
  renderQueueTable();
}

async function queueCancel() {
  const currentToken = DBSync.getToken();
  const bookings = DBSync.getBookings();
  const booking = bookings.find(b => parseInt(b.token) === currentToken && (b.status === 'processing' || b.status === 'approved' || b.status === 'waiting' || b.status === 'pending'));

  if (!booking) { notify('No active token to cancel.', 'error'); return; }
  if (!(await showConfirmModal('Cancel token #' + String(currentToken).padStart(2, '0') + ' (' + (booking.name || 'Customer') + ')? This cannot be undone.'))) return;

  booking.status = 'cancelled';
  DBSync.setBookings(bookings);
  syncBookingStatusToFirestore(booking);

  logActivity('Cancelled Token', currentToken, 'Success');
  notify('Token #' + String(currentToken).padStart(2, '0') + ' cancelled.', 'error');
  refreshQueueControl();
  refreshDashboard();
}

async function queueRecall() {
  const ct = DBSync.getToken();
  if (!(await showConfirmModal('Recall token #' + String(ct).padStart(2, '0') + '? Announcement will be made.'))) return;
  notify('Recall announced: Token #' + String(ct).padStart(2, '0') + ', please proceed to counter.', 'info');
  logActivity('Recalled Token', ct, 'Success');
}

async function queueNoShow() {
  const currentToken = DBSync.getToken();
  const bookings = DBSync.getBookings();
  const booking = bookings.find(b => parseInt(b.token) === currentToken && (b.status === 'processing' || b.status === 'approved' || b.status === 'waiting'));

  if (!booking) { notify('No active token to mark as no-show.', 'error'); return; }
  if (!(await showConfirmModal('Mark token #' + String(currentToken).padStart(2, '0') + ' (' + (booking.name || 'Customer') + ') as no-show? Status will be set to cancelled.'))) return;

  booking.status = 'cancelled';
  DBSync.setBookings(bookings);
  syncBookingStatusToFirestore(booking);

  logActivity('Marked No-Show', currentToken, 'Success');
  notify('Token #' + String(currentToken).padStart(2, '0') + ' marked as no-show.', 'warning');
  refreshQueueControl();
  refreshDashboard();
}

function queueTogglePause() {
  queuePaused = !queuePaused;
  document.getElementById('qcPauseBtn').innerHTML = queuePaused
    ? '<i class="fas fa-play"></i> Resume Queue'
    : '<i class="fas fa-pause"></i> Pause Queue';
  document.getElementById('qcPauseBtn').className = 'db-queue-btn ' + (queuePaused ? 'success' : 'warning');
  notify(queuePaused ? 'Queue paused.' : 'Queue resumed.', queuePaused ? 'warning' : 'success');
  logActivity(queuePaused ? 'Paused Queue' : 'Resumed Queue', '--', 'Success');
}

async function queueUpdateToken() {
  const val = prompt('Enter token number to set as current:');
  if (val && !isNaN(val) && val > 0) {
    if (!(await showConfirmModal('Update current token to #' + String(val).padStart(2, '0') + '?'))) return;
    DBSync.setToken(parseInt(val));
    notify('Current token updated to #' + String(val).padStart(2, '0'), 'success');
    logActivity('Updated Token', val, 'Success');
  refreshQueueControl();
  refreshDashboard();
  window.open('queue-control.html', '_blank');
}
}

async function queueResetToken() {
  if (!(await showConfirmModal('Reset current token to 00? This will start the queue from the beginning.'))) return;
  DBSync.setToken(0);
  notify('Token counter reset to 00. Queue will restart from the beginning.', 'info');
  logActivity('Reset Token', '00', 'Success');
  refreshQueueControl();
  refreshDashboard();
}

async function quickProcess(bookingId) {
  const bookings = DBSync.getBookings();
  const b = bookings.find(x => x.bookingId === bookingId);
  if (!b) return;
  if (!(await showConfirmModal('Process token #' + String(b.token).padStart(2, '0') + ' (' + (b.name || 'Customer') + ')?'))) return;
  b.status = 'processing';
  DBSync.setBookings(bookings);
  syncBookingStatusToFirestore(b);
  DBSync.setToken(parseInt(b.token));
  logActivity('Processed Token', b.token, 'Success');
  renderQueueTable();
  refreshQueueControl();
  refreshDashboard();
}

async function quickComplete(bookingId) {
  const bookings = DBSync.getBookings();
  const b = bookings.find(x => x.bookingId === bookingId);
  if (!b) return;
  if (!(await showConfirmModal('Mark token #' + String(b.token).padStart(2, '0') + ' (' + (b.name || 'Customer') + ') as completed?'))) return;
  b.status = 'completed';
  DBSync.setBookings(bookings);
  syncBookingStatusToFirestore(b);
  logActivity('Quick Completed', b.token, 'Success');
  renderQueueTable();
  refreshQueueControl();
  refreshDashboard();
}

async function quickCancel(bookingId) {
  const bookings = DBSync.getBookings();
  const b = bookings.find(x => x.bookingId === bookingId);
  if (!b) return;
  if (!(await showConfirmModal('Cancel token #' + String(b.token).padStart(2, '0') + ' (' + (b.name || 'Customer') + ')? This cannot be undone.'))) return;
  b.status = 'cancelled';
  DBSync.setBookings(bookings);
  syncBookingStatusToFirestore(b);
  logActivity('Quick Cancelled', b.token, 'Success');
  renderQueueTable();
  refreshQueueControl();
  refreshDashboard();
}

// ============================================
// FIRESTORE SYNC
// ============================================
async function syncBookingStatusToFirestore(booking) {
  if (!window.__bookingsRef || !booking || !booking.bookingId) return;
  try {
    await window.__bookingsRef.doc(booking.bookingId).update({
      status: booking.status,
      updatedAt: new Date().toISOString()
    });
  } catch(e) {
    console.warn('[Dashboard] Failed to sync status to Firestore:', e);
  }
}

// ============================================
// BOOKINGS TABLE
// ============================================
function renderBookingsTable() {
  let bookings = DBSync.getBookings();
  const search = (document.getElementById('bookingsSearch')?.value || '').toLowerCase();
  const dateFilter = document.getElementById('bookingsDateFilter')?.value || '';
  const serviceFilter = document.getElementById('bookingsServiceFilter')?.value || '';

  if (search) bookings = bookings.filter(b => b.name?.toLowerCase().includes(search) || b.email?.toLowerCase().includes(search) || b.token?.includes(search) || b.bookingId?.toLowerCase().includes(search));
  if (dateFilter) bookings = bookings.filter(b => b.date === dateFilter);
  if (serviceFilter) bookings = bookings.filter(b => b.service === serviceFilter);
  bookings = bookings.filter(b => b.status === 'pending' || b.status === 'approved' || b.status === 'processing');

  bookings.sort((a, b) => {
    let va = a[bookingsSortField] || '';
    let vb = b[bookingsSortField] || '';
    if (bookingsSortField === 'token' || bookingsSortField === 'date') { va = va.toString(); vb = vb.toString(); }
    va = va.toString().toLowerCase(); vb = vb.toString().toLowerCase();
    return bookingsSortDir === 'asc' ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
  });

  const total = bookings.length;
  const pages = Math.ceil(total / PAGE_SIZE);
  bookingsPage = Math.min(bookingsPage, pages) || 1;
  const start = (bookingsPage - 1) * PAGE_SIZE;
  const page = bookings.slice(start, start + PAGE_SIZE);

  const tbody = document.getElementById('bookingsTableBody');
  tbody.innerHTML = page.map(b => {
    const statusClass = b.status;
    const statusLabel = b.status.charAt(0).toUpperCase() + b.status.slice(1);
    const d = b.date ? new Date(b.date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '--';
    return `<tr>
      <td class="token-cell">${String(b.token).padStart(2, '0')}</td>
      <td class="name-cell">${b.name || 'N/A'}</td>
      <td>${b.email || '--'}</td>
      <td>${b.service || 'N/A'}</td>
      <td>${d}</td>
      <td><span class="db-badge ${statusClass}">${statusLabel}</span></td>
      <td><div class="db-table-actions">
        <button onclick="quickProcess('${b.bookingId}')" title="Process"><i class="fas fa-play"></i></button>
        <button onclick="quickComplete('${b.bookingId}')" title="Complete"><i class="fas fa-check"></i></button>
        <button onclick="quickCancel('${b.bookingId}')" title="Cancel"><i class="fas fa-ban"></i></button>
      </div></td>
    </tr>`;
  }).join('');

  document.getElementById('bookingsPaginationInfo').textContent = `Showing ${start + 1}-${Math.min(start + PAGE_SIZE, total)} of ${total} entries`;
  renderPagination('bookingsPagination', pages, bookingsPage, (p) => { bookingsPage = p; renderBookingsTable(); });

  // Populate filter dropdowns
  populateFilterOptions();
}

function populateFilterOptions() {
  const bookings = DBSync.getBookings();
  const services = [...new Set(bookings.map(b => b.service).filter(Boolean))];
  const svcSel = document.getElementById('bookingsServiceFilter');
  const curSvc = svcSel.value;
  svcSel.innerHTML = '<option value="">All Services</option>' + services.map(s => `<option value="${s}" ${s === curSvc ? 'selected' : ''}>${s}</option>`).join('');

  populateCompletedFilters();
}

function sortBookings(field) {
  if (bookingsSortField === field) bookingsSortDir = bookingsSortDir === 'asc' ? 'desc' : 'asc';
  else { bookingsSortField = field; bookingsSortDir = 'asc'; }
  renderBookingsTable();
}

// ============================================
// COMPLETED BOOKINGS
// ============================================
function populateCompletedFilters() {
  const bookings = DBSync.getBookings();
  const compDates = [...new Set(bookings.filter(b => b.status === 'completed').map(b => b.date).filter(Boolean))].sort().reverse();
  const dateSel = document.getElementById('completedDateFilter');
  if (!dateSel) return;
  const curVal = dateSel.value;
  dateSel.innerHTML = '<option value="">All Dates</option>' + compDates.map(d => `<option value="${d}" ${d === curVal ? 'selected' : ''}>${new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</option>`).join('');

  const services = [...new Set(bookings.filter(b => b.status === 'completed').map(b => b.service).filter(Boolean))];
  const svcSel = document.getElementById('completedServiceFilter');
  const curSvc = svcSel.value;
  svcSel.innerHTML = '<option value="">All Services</option>' + services.map(s => `<option value="${s}" ${s === curSvc ? 'selected' : ''}>${s}</option>`).join('');
}

function renderCompletedBookings() {
  let bookings = DBSync.getBookings().filter(b => b.status === 'completed');
  const search = (document.getElementById('completedSearch')?.value || '').toLowerCase();
  const dateFilter = document.getElementById('completedDateFilter')?.value || '';
  const serviceFilter = document.getElementById('completedServiceFilter')?.value || '';

  if (search) bookings = bookings.filter(b => b.name?.toLowerCase().includes(search) || b.email?.toLowerCase().includes(search) || b.token?.includes(search) || b.aadhaarLast4?.includes(search));
  if (dateFilter) bookings = bookings.filter(b => b.date === dateFilter);
  if (serviceFilter) bookings = bookings.filter(b => b.service === serviceFilter);

  bookings.sort((a, b) => {
    let va = a[completedSortField] || '';
    let vb = b[completedSortField] || '';
    if (completedSortField === 'token' || completedSortField === 'date') { va = va.toString(); vb = vb.toString(); }
    va = va.toString().toLowerCase(); vb = vb.toString().toLowerCase();
    return completedSortDir === 'asc' ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
  });

  const total = bookings.length;
  const pages = Math.ceil(total / PAGE_SIZE);
  completedPage = Math.min(completedPage, pages) || 1;
  const start = (completedPage - 1) * PAGE_SIZE;
  const page = bookings.slice(start, start + PAGE_SIZE);

  const tbody = document.getElementById('completedTableBody');
  tbody.innerHTML = page.map(b => {
    const d = b.date ? new Date(b.date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '--';
    return `<tr>
      <td class="token-cell">${String(b.token).padStart(2, '0')}</td>
      <td class="name-cell">${b.name || 'N/A'}</td>
      <td style="font-family:'Space Grotesk',sans-serif;letter-spacing:0.05em;">xxxx xxxx ${b.aadhaarLast4 || '----'}</td>
      <td>${b.service || 'N/A'}</td>
      <td>${b.email || '--'}</td>
      <td>${d}</td>
    </tr>`;
  }).join('');

  document.getElementById('completedPaginationInfo').textContent = `Showing ${start + 1}-${Math.min(start + PAGE_SIZE, total)} of ${total} completed entries`;
  renderPagination('completedPagination', pages, completedPage, (p) => { completedPage = p; renderCompletedBookings(); });
  document.getElementById('completedCount').textContent = total + ' total';
}

function sortCompleted(field) {
  if (completedSortField === field) completedSortDir = completedSortDir === 'asc' ? 'desc' : 'asc';
  else { completedSortField = field; completedSortDir = 'asc'; }
  renderCompletedBookings();
}

function renderPagination(id, pages, current, callback) {
  const el = document.getElementById(id);
  if (!el) return;
  if (pages <= 1) { el.innerHTML = ''; return; }
  let html = '';
  for (let i = 1; i <= pages; i++) {
    if (i === 1 || i === pages || Math.abs(i - current) <= 2) {
      html += `<button class="${i === current ? 'active' : ''}" data-p="${i}">${i}</button>`;
    } else if (html.endsWith('...</span>') === false) {
      html += '<span style="padding:0 6px;color:var(--db-text3);">...</span>';
    }
  }
  el.innerHTML = html;
  el.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => callback(parseInt(btn.dataset.p)));
  });
}

// ============================================
// CALENDAR
// ============================================
function renderCalendar() {
  const year = calViewDate.getFullYear();
  const month = calViewDate.getMonth();
  const targetDays = [2, 5]; // Tuesday, Friday

  document.getElementById('calMonthLabel').textContent = new Date(year, month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = getToday();

  const bookings = DBSync.getBookings();
  const dailyCap = parseInt(document.getElementById('calDailyCap')?.value) || 50;

  let html = '';
  const headers = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  headers.forEach(h => html += `<div class="db-calendar-day-header">${h}</div>`);

  for (let i = 0; i < firstDay; i++) html += '<div></div>';

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const isToday = dateStr === today;
    const dayBookings = bookings.filter(b => b.date === dateStr);
    const bookedCount = dayBookings.length;
    const remaining = dailyCap - bookedCount;
    const dayOfWeek = new Date(year, month, day).getDay();

    const isTargetDay = targetDays.includes(dayOfWeek);
    let cls = 'db-calendar-day';
    if (isToday) cls += ' today';
    if (!isTargetDay) cls += ' disabled';

    if (isTargetDay) {
      html += `<div class="${cls}" onclick="toggleCalendarDate('${dateStr}')">
        <span>${day}</span>
        <div class="slot-info ${remaining > 0 ? 'available' : 'full'}">${bookedCount}/${dailyCap}</div>
      </div>`;
    } else {
      html += `<div class="${cls}"><span>${day}</span></div>`;
    }
  }

  document.getElementById('calGrid').innerHTML = html;

  // Today's stats
  const todayBookings = bookings.filter(b => b.date === today);
  const dailyCapStr = dailyCap + ' max';
  const bookedStr = todayBookings.length + ' booked';
  const remainStr = Math.max(0, dailyCap - todayBookings.length) + ' remaining';
  document.getElementById('calAvailableSlots').textContent = dailyCapStr;
  document.getElementById('calBookedSlots').textContent = todayBookings.length;
  document.getElementById('calRemainingSlots').textContent = remainStr;
  document.getElementById('calDailyCapDisplay').textContent = dailyCap;
  document.getElementById('calTodayDate').textContent = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  // Also update settings section fields if visible
  var sAvail = document.getElementById('setCalAvailableSlots');
  if (sAvail) sAvail.value = dailyCapStr;
  var sBooked = document.getElementById('setCalBookedSlots');
  if (sBooked) sBooked.value = bookedStr;
  var sRemain = document.getElementById('setCalRemainingSlots');
  if (sRemain) sRemain.value = remainStr;
}

function calNavigate(dir) {
  if (dir === 0) { calViewDate = new Date(); }
  else { calViewDate.setMonth(calViewDate.getMonth() + dir); }
  renderCalendar();
}

function toggleCalendarDate(dateStr) {
  const bookings = DBSync.getBookings().filter(b => b.date === dateStr);
  const dailyCap = parseInt(document.getElementById('calDailyCap')?.value) || 50;
  const total = bookings.length;
  const remaining = Math.max(0, dailyCap - total);
  const dateLabel = new Date(dateStr + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  notify(dateLabel + ' — ' + total + ' booked, ' + remaining + ' remaining', total >= dailyCap ? 'error' : 'info');
}

function updateCalendarSettings() {
  renderCalendar();
  notify('Daily capacity updated.', 'success');
}

// ============================================
// CUSTOMERS
// ============================================
function renderCustomers() {
  const bookings = DBSync.getBookings();
  const search = (document.getElementById('customerSearch')?.value || '').toLowerCase();

  const customerMap = {};
  bookings.forEach(b => {
    if (!b.email) return;
    if (!customerMap[b.email]) customerMap[b.email] = { email: b.email, name: b.name || 'Unknown', aadhaar: b.aadhaarLast4 || '--', bookings: [] };
    customerMap[b.email].bookings.push(b);
    if (b.name && !customerMap[b.email].name.startsWith(b.name)) customerMap[b.email].name = b.name;
  });

  let customers = Object.values(customerMap);
  if (search) customers = customers.filter(c => c.name.toLowerCase().includes(search) || c.email.toLowerCase().includes(search));

  customers.sort((a, b) => b.bookings.length - a.bookings.length);

  const tbody = document.getElementById('customerTableBody');
  tbody.innerHTML = customers.map(c => {
    const lastBooking = c.bookings.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
    const lastDate = lastBooking?.date ? new Date(lastBooking.date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '--';
    const active = c.bookings.some(b => b.status === 'approved' || b.status === 'pending' || b.status === 'processing');
    const initials = c.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    return `<tr>
      <td><div style="display:flex;align-items:center;gap:10px;"><div style="width:32px;height:32px;border-radius:8px;background:linear-gradient(135deg,var(--db-accent),#6366f1);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;color:#fff;">${initials}</div><span class="name-cell">${c.name}</span></div></td>
      <td>${c.email}</td>
      <td style="font-family:'Space Grotesk',sans-serif;letter-spacing:0.05em;">xxxx xxxx ${c.aadhaar}</td>
      <td>${c.bookings.length}</td>
      <td>${lastDate}</td>
      <td><span class="db-badge ${active ? 'approved' : 'completed'}">${active ? 'Active' : 'Inactive'}</span></td>
    </tr>`;
  }).join('');

  document.getElementById('customerPaginationInfo').textContent = `Showing ${customers.length} customers`;
}

// ============================================
// ACTIVITY LOGS
// ============================================
function loadActivityLog() {
  try { const d = localStorage.getItem('ds_activity'); if (d) activityLog = JSON.parse(d); } catch(e) {}
}
function saveActivityLog() {
  localStorage.setItem('ds_activity', JSON.stringify(activityLog));
}
function logActivity(action, token, result) {
  const now = new Date();
  activityLog.unshift({ timestamp: now.toISOString(), admin: 'Admin', action, token: token || '--', result });
  if (activityLog.length > 5000) activityLog = activityLog.slice(0, 5000);
  saveActivityLog();
}

function renderActivity() {
  const search = (document.getElementById('activitySearch')?.value || '').toLowerCase();
  let logs = [...activityLog];

  if (search) logs = logs.filter(l => l.action.toLowerCase().includes(search) || l.token?.includes(search) || l.admin?.toLowerCase().includes(search));

  const el = document.getElementById('activityList');
  el.innerHTML = logs.slice(0, 100).map(l => {
    const d = new Date(l.timestamp);
    const timeStr = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    const resultClass = l.result === 'Success' ? 'success' : 'error';
    const icons = { 'Called': 'fa-forward-step', 'Marked': 'fa-check', 'Skipped': 'fa-forward', 'Cancelled': 'fa-ban', 'Updated': 'fa-pencil', 'Paused': 'fa-pause', 'Resumed': 'fa-play', 'Recalled': 'fa-rotate-left', 'Quick': 'fa-bolt', 'Processed': 'fa-play' };
    const icon = Object.entries(icons).find(([k]) => l.action.includes(k))?.[1] || 'fa-circle';
    return `<div class="db-activity-item">
      <div class="db-activity-icon"><i class="fas ${icon}"></i></div>
      <div class="db-activity-content">
        <div class="db-activity-text"><strong>${l.admin}</strong> ${l.action} <span class="db-activity-result ${resultClass}">${l.result}</span></div>
        <div class="db-activity-time">${timeStr} ${l.token !== '--' ? '— Token #' + String(l.token).padStart(2, '0') : ''}</div>
      </div>
    </div>`;
  }).join('');

  if (logs.length === 0) el.innerHTML = '<div style="text-align:center;padding:40px;color:var(--db-text3);font-size:14px;">No activity logs yet.</div>';
}

// ============================================
// EXPORT
// ============================================
function exportReport(type) {
  notify('Export feature requires server-side implementation.', 'info');
  logActivity('Attempted to export ' + type + ' report', '--', 'Info');
}

// ============================================
// ADMIN MANAGEMENT
// ============================================
let admins = [];
let _adminsUnsub = null;

function renderAdmins() {
  if (!window.__adminsRef) return;
  if (_adminsUnsub) { _adminsUnsub(); _adminsUnsub = null; }
  _adminsUnsub = window.__adminsRef.onSnapshot(function(snap) {
    admins = [];
    snap.forEach(function(doc) { admins.push({ email: doc.id, ...doc.data() }); });
    var el = document.getElementById('adminListBody');
    if (!el) return;
    if (!admins.length) {
      el.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--db-text3);">No admins configured. Add the first admin email to get started.</td></tr>';
      return;
    }
    el.innerHTML = admins.map(function(a) {
      var roleLabel = a.role ? a.role.charAt(0).toUpperCase() + a.role.slice(1) : 'Staff';
      var d = a.added ? new Date(a.added).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '--';
      var isSelf = currentAdmin && currentAdmin.email === a.email;
      return '<tr>' +
        '<td class="name-cell">' + (a.email || '--') + (isSelf ? ' <span class="db-badge approved" style="font-size:10px;">You</span>' : '') + '</td>' +
        '<td><span class="db-role-badge ' + (a.role || 'staff') + '">' + roleLabel + '</span></td>' +
        '<td style="color:var(--db-text3);font-size:13px;">' + d + '</td>' +
        '<td><button class="db-quick-action" style="background:rgba(239,68,68,0.1);color:#ef4444;border-color:rgba(239,68,68,0.2);" onclick="removeAdmin(\'' + a.email.replace(/'/g, "\\'") + '\')"><i class="fas fa-trash"></i></button></td>' +
        '</tr>';
    }).join('');
  }, function() {
    var el = document.getElementById('adminListBody');
    if (el) el.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--db-text3);">Could not load admins.</td></tr>';
  });
}

async function addAdmin() {
  var email = prompt('Enter the Google email address to authorize:');
  if (!email || !email.includes('@')) { notify('Enter a valid email address.', 'error'); return; }
  email = email.trim().toLowerCase();
  var role = prompt('Enter role (owner / manager / staff):', 'staff');
  if (!role || !['owner', 'manager', 'staff'].includes(role.toLowerCase())) { notify('Invalid role. Choose: owner, manager, or staff.', 'error'); return; }
  role = role.toLowerCase();
  if (!(await showConfirmModal('Authorize ' + email + ' as ' + role + '?'))) return;
  if (!window.__adminsRef) { notify('Firestore not available.', 'error'); return; }
  try {
    await window.__adminsRef.doc(email).set({ role: role, added: new Date().toISOString() });
    logActivity('Added Admin: ' + email, '--', 'Success');
    notify('Authorized ' + email + ' as ' + role + '.', 'success');
  } catch(e) {
    notify('Failed to add admin: ' + e.message, 'error');
  }
}

async function removeAdmin(email) {
  if (currentAdmin && currentAdmin.email === email) {
    notify('You cannot remove yourself.', 'error');
    return;
  }
  if (!(await showConfirmModal('Remove admin access for ' + email + '? They will be signed out immediately.'))) return;
  if (!window.__adminsRef) { notify('Firestore not available.', 'error'); return; }
  try {
    await window.__adminsRef.doc(email).update({ active: false, removedAt: new Date().toISOString() });
    logActivity('Removed Admin: ' + email, '--', 'Success');
    notify('Removed ' + email + ' from admin access.', 'warning');
  } catch(e) {
    notify('Failed to remove admin: ' + e.message, 'error');
  }
}

// ============================================
// NOTIFICATIONS
// ============================================
let notifications = [];

function loadNotifications() {
  try { const d = localStorage.getItem('ds_notifications'); if (d) notifications = JSON.parse(d); } catch(e) {}
  updateNotifBadge();
}
function saveNotifications() {
  try { localStorage.setItem('ds_notifications', JSON.stringify(notifications.slice(0, 100))); } catch(e) {}
}

function renderNotifications() {
  const el = document.getElementById('notifList');
  if (!el) return;
  if (!notifications.length) {
    el.innerHTML = '<div style="text-align:center;padding:24px;color:var(--db-text3);">No notifications</div>';
    return;
  }
  el.innerHTML = notifications.map(n => {
    const iconClass = n.type === 'warning' ? 'warning' : n.type === 'error' ? 'error' : n.type === 'success' ? 'success' : 'info';
    const icon = n.type === 'warning' ? 'fa-triangle-exclamation' : n.type === 'error' ? 'fa-circle-exclamation' : 'fa-circle-info';
    return `<div class="db-notif-item" style="${n.read ? 'opacity:0.6;' : ''}" onclick="markNotifRead(this)">
      <div class="db-notif-icon ${iconClass}"><i class="fas ${icon}"></i></div>
      <div><div class="db-notif-text">${n.text}</div><div class="db-notif-time">${n.time || '--'}</div></div>
    </div>`;
  }).join('');
}

function markNotifRead(el) {
  el.style.opacity = '0.6';
  const idx = Array.from(el.parentNode.children).indexOf(el);
  if (notifications[idx]) { notifications[idx].read = true; saveNotifications(); }
  updateNotifBadge();
}

function markAllNotifRead() {
  notifications.forEach(n => n.read = true);
  saveNotifications();
  renderNotifications();
  updateNotifBadge();
  notify('All notifications marked as read.', 'success');
}

function updateNotifBadge() {
  const unread = notifications.filter(n => !n.read).length;
  document.getElementById('notifBadgeSidebar').textContent = unread || '';
  document.getElementById('notifBadgeSidebar').style.display = unread ? 'inline' : 'none';
}

// ============================================
// SETTINGS
// ============================================
async function saveSettings() {
  if (!(await showConfirmModal('Save all settings? This may affect system behavior.'))) return;
  const fields = [
    { id:'setCenterName', label:'Center Name', key:'centerName' },
    { id:'setAddress', label:'Address', key:'address' },
    { id:'setContact', label:'Contact', key:'contact' },
    { id:'setOpen', label:'Opening Time', key:'open' },
    { id:'setClose', label:'Closing Time', key:'close' },
    { id:'setBreakStart', label:'Break Start', key:'breakStart' },
    { id:'setBreakEnd', label:'Break End', key:'breakEnd' },
    { id:'setWorkingDays', label:'Working Days', key:'workingDays' },
    { id:'setMaxDaily', label:'Max Daily', key:'maxDaily' },
    { id:'setMinAdvance', label:'Min Advance', key:'minAdvance' },
    { id:'setMaxAdvance', label:'Max Advance', key:'maxAdvance' },
    { id:'setTokenPrefix', label:'Token Prefix', key:'tokenPrefix' },
    { id:'setTokenFormat', label:'Token Format', key:'tokenFormat' },
    { id:'setAutoReset', label:'Auto Reset', key:'autoReset' },
    { id:'setOtpLength', label:'OTP Length', key:'otp_length' },
    { id:'setOtpExpiry', label:'OTP Expiry', key:'otp_expiry' },
    { id:'setDailySmsLimit', label:'Daily SMS Limit', key:'daily_limit' },
    { id:'setTheme', label:'Theme', key:'theme' },
    { id:'setAccent', label:'Accent Color', key:'accent' },
  ];
  const oldSettings = JSON.parse(localStorage.getItem('ds_settings') || '{}');
  const changes = [];
  const newVals = {};
  fields.forEach(f => {
    const el = document.getElementById(f.id);
    if (!el) return;
    const val = el.value;
    newVals[f.key] = val;
    if (String(oldSettings[f.key] ?? '') !== String(val)) {
      changes.push(f.label + ': ' + (oldSettings[f.key] || '(empty)') + ' → ' + (val || '(empty)'));
    }
  });
  localStorage.setItem('ds_settings', JSON.stringify(newVals));

  if (changes.length) {
    changes.forEach(c => logActivity('Updated Settings: ' + c, '--', 'Success'));
  }
  notify(changes.length + ' setting(s) saved successfully.', 'success');
}

// ============================================
// CONFIRMATION MODAL
// ============================================
let _modalResolve = null;

function showConfirmModal(msg) {
  return new Promise(resolve => {
    _modalResolve = resolve;
    document.getElementById('modalMsg').textContent = msg;
    document.getElementById('confirmModalOverlay').classList.add('open');
    document.getElementById('modalConfirmBtn').classList.remove('loading');
    document.getElementById('modalConfirmBtn').querySelector('.modal-btn-text').textContent = 'Yes, Continue';
    setTimeout(() => document.getElementById('modalConfirmBtn').focus(), 100);
  });
}

function closeConfirmModal(result, event) {
  if (event && event.target !== event.currentTarget) return;
  document.getElementById('confirmModalOverlay').classList.remove('open');
  if (_modalResolve) {
    _modalResolve(result);
    _modalResolve = null;
  }
}

function executeConfirmModal() {
  const btn = document.getElementById('modalConfirmBtn');
  btn.classList.add('loading');
  setTimeout(() => {
    document.getElementById('confirmModalOverlay').classList.remove('open');
    if (_modalResolve) {
      _modalResolve(true);
      _modalResolve = null;
    }
  }, 300);
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && document.getElementById('confirmModalOverlay').classList.contains('open')) {
    closeConfirmModal(false);
  }
});

// ============================================
// NOTIFICATION HELPER
// ============================================
function notify(msg, type) {
  let n = document.getElementById('_dbNotif');
  if (!n) {
    n = document.createElement('div');
    n.id = '_dbNotif';
    n.style.cssText = 'position:fixed;z-index:9999;padding:14px 24px;border-radius:12px;font-size:13px;font-weight:500;font-family:Inter,sans-serif;max-width:460px;transition:all 0.35s cubic-bezier(0.4,0,0.2,1);opacity:0;box-shadow:0 8px 32px rgba(0,0,0,0.4);pointer-events:none;';
    document.body.appendChild(n);
  }

  const colors = {
    success: { bg: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', color: '#22c55e' },
    error: { bg: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444' },
    warning: { bg: 'rgba(234,179,8,0.15)', border: '1px solid rgba(234,179,8,0.3)', color: '#eab308' },
    info: { bg: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)', color: '#3b82f6' },
  };
  const c = colors[type] || colors.info;

  if (type === 'error') {
    n.style.bottom = '24px'; n.style.left = '50%';
    n.style.top = 'auto'; n.style.right = 'auto';
    n.style.transform = 'translateX(-50%) translateY(20px)';
    n.style.maxWidth = '500px';
    n.style.textAlign = 'center';
    n.style.padding = '20px 32px';
    n.style.fontSize = '14px';
    n.style.fontWeight = '600';
  } else {
    n.style.bottom = '24px'; n.style.right = '24px';
    n.style.top = 'auto'; n.style.left = 'auto';
    n.style.transform = 'translateY(20px)';
    n.style.textAlign = 'left';
    n.style.padding = '14px 24px';
  }

  n.textContent = msg;
  n.style.background = c.bg;
  n.style.border = c.border;
  n.style.color = c.color;
  n.style.opacity = '1';
  if (type === 'error') {
    n.style.transform = 'translateX(-50%) translateY(0)';
  } else {
    n.style.transform = 'translateY(0)';
  }

  clearTimeout(n._t);
  n._t = setTimeout(() => {
    n.style.opacity = '0';
    if (type === 'error') {
      n.style.transform = 'translateX(-50%) translateY(20px)';
    } else {
      n.style.transform = 'translateY(20px)';
    }
  }, 3500);
}
