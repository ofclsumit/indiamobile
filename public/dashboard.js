/* ============================================
   DASHBOARD — Operations Management
   ============================================ */

// ============================================
// STATE
// ============================================
let queueSortField = 'token';
let queueSortDir = 'asc';
let bookingsSortField = 'token';
let bookingsSortDir = 'asc';
let queuePage = 1;
let bookingsPage = 1;
const PAGE_SIZE = 10;

let calViewDate = new Date();
let queuePaused = false;
let activityLog = [];
let charts = {};
let _refreshTimer = null;
let _activeSection = 'overview';

// ============================================
// INIT
// ============================================
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('currentDateDisplay').textContent = new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  loadActivityLog();

  // Subscribe to real-time changes
  DBSync.subscribe((data) => {
    debouncedRefresh(data);
  });

  fullRefresh();

  // Responsive menu button
  if (window.innerWidth <= 768) document.getElementById('menuBtn').style.display = 'flex';
  window.addEventListener('resize', () => {
    document.getElementById('menuBtn').style.display = window.innerWidth <= 768 ? 'flex' : 'none';
  });
});

function fullRefresh() {
  refreshDashboard();
  renderQueueTable();
  renderBookingsTable();
  renderCalendar();
  renderCustomers();
  renderActivity();
  renderAdmins();
  renderNotifications();
  initCharts();
  refreshQueueControl();
  loadSmsConfig();
}

function toggleSmsFields() {
  const driver = document.getElementById('setSmsDriver').value;
  document.getElementById('fast2smsFields').style.display = driver === 'fast2sms' ? 'block' : 'none';
  document.getElementById('msg91Fields').style.display = driver === 'msg91' ? 'block' : 'none';
}

function loadSmsConfig() {
  Promise.all([
    fetch('api/otp?action=status').then(r => r.json()).catch(() => ({})),
    fetch('api/otp?action=get_config').then(r => r.json()).catch(() => ({}))
  ]).then(([status, cfgData]) => {
    const cfg = cfgData.config || {};
    if (document.getElementById('setOtpLength')) document.getElementById('setOtpLength').value = status.otp_length || cfg.otp_length || 6;
    if (document.getElementById('setOtpExpiry')) document.getElementById('setOtpExpiry').value = status.otp_expiry || cfg.otp_expiry || 300;
    if (document.getElementById('setDailySmsLimit')) document.getElementById('setDailySmsLimit').value = status.limit || cfg.daily_limit || 100;
    if (document.getElementById('setSmsDriver')) document.getElementById('setSmsDriver').value = cfg.driver || 'log';
    if (document.getElementById('setFast2SmsSender')) document.getElementById('setFast2SmsSender').value = cfg.fast2sms_sender_id || 'FTWSMS';
    if (document.getElementById('setMsg91Sender')) document.getElementById('setMsg91Sender').value = cfg.msg91_sender_id || 'MSGIND';
    if (document.getElementById('setSmsTemplate')) document.getElementById('setSmsTemplate').value = cfg.sms_template || '';
    toggleSmsFields();
  }).catch(() => {});
}

function debouncedRefresh(data) {
  if (_refreshTimer) { clearTimeout(_refreshTimer); _refreshTimer = null; }
  _refreshTimer = setTimeout(() => {
    _refreshTimer = null;
    // Refresh all visible sections
    if (document.getElementById('section-overview')?.classList.contains('active')) refreshDashboard();
    if (document.getElementById('section-queue')?.classList.contains('active')) renderQueueTable();
    if (document.getElementById('section-bookings')?.classList.contains('active')) renderBookingsTable();
    if (document.getElementById('section-queuecontrol')?.classList.contains('active')) refreshQueueControl();
    if (document.getElementById('section-calendar')?.classList.contains('active')) renderCalendar();
    if (document.getElementById('section-customers')?.classList.contains('active')) renderCustomers();
    if (document.getElementById('section-activity')?.classList.contains('active')) renderActivity();
    if (document.getElementById('section-analytics')?.classList.contains('active')) initCharts();
  }, 200);
}

// ============================================
// SECTION SWITCHING
// ============================================
function switchSection(id, el, type) {
  document.querySelectorAll('.db-section').forEach(s => s.classList.remove('active'));
  document.getElementById('section-' + id).classList.add('active');

  document.querySelectorAll('.db-sidebar-item').forEach(i => i.classList.remove('active'));
  document.querySelectorAll('.db-mobile-nav-item').forEach(i => i.classList.remove('active'));

  if (el) el.classList.add('active');

  // Refresh section data
  if (id === 'overview') refreshDashboard();
  if (id === 'queue') renderQueueTable();
  if (id === 'bookings') renderBookingsTable();
  if (id === 'queuecontrol') refreshQueueControl();
  if (id === 'calendar') renderCalendar();
  if (id === 'customers') renderCustomers();
  if (id === 'activity') renderActivity();
  if (id === 'analytics') initCharts();
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

// ============================================
// KPI DASHBOARD
// ============================================
function refreshDashboard() {
  const bookings = DBSync.getBookings();
  const today = new Date().toISOString().split('T')[0];
  const todayBookings = bookings.filter(b => b.date === today);
  const currentToken = DBSync.getToken();

  document.getElementById('kpiTodayBookings').textContent = todayBookings.length;
  document.getElementById('kpiCurrentToken').textContent = currentToken > 0 ? String(currentToken).padStart(2, '0') : '--';

  const active = todayBookings.filter(b => b.status === 'approved' || b.status === 'pending');
  const pending = todayBookings.filter(b => b.status === 'pending');
  const completed = todayBookings.filter(b => b.status === 'completed');
  const cancelled = todayBookings.filter(b => b.status === 'cancelled');

  document.getElementById('kpiPending').textContent = pending.length;
  document.getElementById('kpiCompleted').textContent = completed.length;
  document.getElementById('kpiCancelled').textContent = cancelled.length;

  const avgWait = pending.length > 0 ? Math.round(active.length * 15 / Math.max(pending.length, 1)) : 0;
  document.getElementById('kpiAvgWait').innerHTML = `<span style="font-size:16px;">${avgWait}</span> min`;

  if (active.length > 0) {
    const next = active.find(b => parseInt(b.token) > currentToken);
    if (next) {
      document.getElementById('kpiCurrentService').textContent = next.service + ' (Token ' + next.token + ')';
      document.getElementById('kpiCurrentService').style.color = 'var(--db-text2)';
    }
  }

  animateCounter('kpiTodayBookings', todayBookings.length);
  updateTodayChart(todayBookings);

  // Live update pulse on cards
  document.querySelectorAll('.db-card').forEach(c => { c.classList.remove('live-update'); void c.offsetWidth; c.classList.add('live-update'); });
}

function animateCounter(id, target) {
  const el = document.getElementById(id);
  if (!el) return;
  const current = parseInt(el.textContent) || 0;
  if (current === target) return;
  let start = current;
  const dur = 600;
  const startTime = performance.now();
  function step(now) {
    const p = Math.min((now - startTime) / dur, 1);
    el.textContent = Math.floor(start + (target - start) * p);
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// ============================================
// QUEUE TABLE
// ============================================
function renderQueueTable() {
  const bookings = DBSync.getBookings();
  const today = new Date().toISOString().split('T')[0];
  let queue = bookings.filter(b => b.date === today && (b.status === 'approved' || b.status === 'pending' || b.status === 'waiting' || b.status === 'processing'));

  const search = (document.getElementById('queueSearch')?.value || '').toLowerCase();
  const statusFilter = document.getElementById('queueStatusFilter')?.value || '';

  if (search) queue = queue.filter(b => b.name?.toLowerCase().includes(search) || b.email?.toLowerCase().includes(search) || b.token?.includes(search));
  if (statusFilter) queue = queue.filter(b => b.status === statusFilter);

  queue.sort((a, b) => {
    let va = parseInt(a[queueSortField]) || a[queueSortField] || '';
    let vb = parseInt(b[queueSortField]) || b[queueSortField] || '';
    if (typeof va === 'string') { va = va.toLowerCase(); vb = (vb || '').toLowerCase(); }
    return queueSortDir === 'asc' ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
  });

  const total = queue.length;
  const pages = Math.ceil(total / PAGE_SIZE);
  queuePage = Math.min(queuePage, pages) || 1;
  const start = (queuePage - 1) * PAGE_SIZE;
  const page = queue.slice(start, start + PAGE_SIZE);

  const tbody = document.getElementById('queueTableBody');
  tbody.innerHTML = page.map(b => {
    const statusClass = b.status === 'approved' || b.status === 'waiting' ? 'waiting' : b.status;
    const statusLabel = b.status === 'approved' ? 'Waiting' : b.status.charAt(0).toUpperCase() + b.status.slice(1);
    return `<tr>
      <td class="token-cell">${String(b.token).padStart(2, '0')}</td>
      <td class="name-cell">${b.name || 'N/A'}</td>
      <td>${b.service || 'N/A'}</td>
      <td>${b.createdAt ? new Date(b.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '--'}</td>
      <td><span class="db-badge ${statusClass}">${statusLabel}</span></td>
      <td><div class="db-table-actions">
        <button onclick="quickProcess('${b.bookingId}')" title="Process"><i class="fas fa-play"></i></button>
        <button onclick="quickComplete('${b.bookingId}')" title="Complete"><i class="fas fa-check"></i></button>
        <button onclick="quickCancel('${b.bookingId}')" title="Cancel"><i class="fas fa-ban"></i></button>
      </div></td>
    </tr>`;
  }).join('');

  document.getElementById('queuePaginationInfo').textContent = `Showing ${start + 1}-${Math.min(start + PAGE_SIZE, total)} of ${total} entries`;
  renderPagination('queuePagination', pages, queuePage, (p) => { queuePage = p; renderQueueTable(); });

  // Queue stats
  document.getElementById('queueTotalToday').textContent = bookings.filter(b => b.date === today).length;
  document.getElementById('queueWaiting').textContent = bookings.filter(b => b.date === today && (b.status === 'approved' || b.status === 'pending' || b.status === 'waiting')).length;
  document.getElementById('queueInProgress').textContent = bookings.filter(b => b.date === today && b.status === 'processing').length;
  document.getElementById('queueCompleted').textContent = bookings.filter(b => b.date === today && b.status === 'completed').length;
}

function sortQueue(field) {
  if (queueSortField === field) queueSortDir = queueSortDir === 'asc' ? 'desc' : 'asc';
  else { queueSortField = field; queueSortDir = 'asc'; }
  renderQueueTable();
}

function renderPagination(id, pages, current, callback) {
  const el = document.getElementById(id);
  if (!el) return;
  if (pages <= 1) { el.innerHTML = ''; return; }
  let html = '';
  for (let i = 1; i <= pages; i++) {
    html += `<button class="${i === current ? 'active' : ''}" onclick="(${callback})(this.dataset.p)" data-p="${i}">${i}</button>`;
  }
  el.innerHTML = html;
  el.querySelectorAll('button').forEach(b => b.addEventListener('click', () => callback(parseInt(b.dataset.p))));
}

// ============================================
// QUEUE CONTROL
// ============================================
function refreshQueueControl() {
  const bookings = DBSync.getBookings();
  const today = new Date().toISOString().split('T')[0];
  const todayBookings = bookings.filter(b => b.date === today);
  const currentToken = DBSync.getToken();
  const active = todayBookings.filter(b => b.status === 'approved' || b.status === 'pending' || b.status === 'waiting' || b.status === 'processing');
  const waiting = todayBookings.filter(b => b.status === 'approved' || b.status === 'pending' || b.status === 'waiting');
  const processing = todayBookings.filter(b => b.status === 'processing');

  const currentBooking = todayBookings.find(b => parseInt(b.token) === currentToken);
  const nextBooking = todayBookings.find(b => parseInt(b.token) > currentToken && (b.status === 'approved' || b.status === 'pending' || b.status === 'waiting'));

  document.getElementById('qcCurrentToken').textContent = String(currentToken).padStart(2, '0');
  document.getElementById('qcCurrentInfo').textContent = currentBooking
    ? `${currentBooking.name || 'N/A'} — ${currentBooking.service || 'N/A'}`
    : 'No active token';
  document.getElementById('qcNextToken').textContent = nextBooking ? String(nextBooking.token).padStart(2, '0') : '--';
  document.getElementById('qcPeopleWaiting').textContent = waiting.length + processing.length;
  document.getElementById('qcQueueLength').textContent = active.length;
  document.getElementById('qcEstTime').textContent = waiting.length * 15;

  renderQCQueueTable();
}

function renderQCQueueTable() {
  const bookings = DBSync.getBookings();
  const today = new Date().toISOString().split('T')[0];
  const queue = bookings.filter(b => b.date === today && (b.status === 'approved' || b.status === 'pending' || b.status === 'waiting' || b.status === 'processing'));
  queue.sort((a, b) => parseInt(a.token) - parseInt(b.token));

  document.getElementById('qcActiveCount').textContent = queue.length + ' active tokens';

  const tbody = document.getElementById('qcTableBody');
  tbody.innerHTML = queue.map(b => {
    const statusClass = b.status === 'approved' || b.status === 'waiting' ? 'waiting' : b.status === 'processing' ? 'processing' : b.status;
    const statusLabel = b.status === 'approved' ? 'Waiting' : b.status.charAt(0).toUpperCase() + b.status.slice(1);
    return `<tr>
      <td class="token-cell">${String(b.token).padStart(2, '0')}</td>
      <td class="name-cell">${b.name || 'N/A'}</td>
      <td>${b.service || 'N/A'}</td>
      <td><span class="db-badge ${statusClass}">${statusLabel}</span></td>
      <td><div class="db-table-actions">
        <button onclick="quickComplete('${b.bookingId}')" title="Complete"><i class="fas fa-check"></i></button>
        <button onclick="quickCancel('${b.bookingId}')" title="Cancel"><i class="fas fa-ban"></i></button>
      </div></td>
    </tr>`;
  }).join('');
}

function queueCallNext() {
  const bookings = DBSync.getBookings();
  const today = new Date().toISOString().split('T')[0];
  const waiting = bookings.filter(b => b.date === today && (b.status === 'approved' || b.status === 'pending' || b.status === 'waiting'));
  waiting.sort((a, b) => parseInt(a.token) - parseInt(b.token));

  if (waiting.length === 0) { notify('No customers waiting in queue.', 'error'); return; }

  const next = waiting[0];
  next.status = 'processing';
  DBSync.setBookings(bookings);
  DBSync.setToken(parseInt(next.token));

  logActivity('Called Next Token', next.token, 'Success');
  notify('Called Token #' + next.token + ' — ' + (next.name || 'Customer'), 'success');
  refreshQueueControl();
  refreshDashboard();
  renderQueueTable();
}

function queueMarkComplete() {
  const bookings = DBSync.getBookings();
  const currentToken = DBSync.getToken();
  const booking = bookings.find(b => parseInt(b.token) === currentToken && (b.status === 'processing' || b.status === 'approved' || b.status === 'waiting'));

  if (!booking) { notify('No active token to mark as completed.', 'error'); return; }

  booking.status = 'completed';
  DBSync.setBookings(bookings);

  logActivity('Marked Completed', currentToken, 'Success');
  notify('Token #' + String(currentToken).padStart(2, '0') + ' marked as completed.', 'success');
  refreshQueueControl();
  refreshDashboard();
  renderQueueTable();
}

function queueSkip() {
  const bookings = DBSync.getBookings();
  const today = new Date().toISOString().split('T')[0];
  const processing = bookings.find(b => b.date === today && b.status === 'processing');

  if (!processing) { notify('No customer currently being served.', 'error'); return; }

  processing.status = 'approved'; // Put back to waiting
  DBSync.setBookings(bookings);

  logActivity('Skipped Token', processing.token, 'Success');
  notify('Token #' + processing.token + ' skipped and moved to end of queue.', 'warning');
  refreshQueueControl();
  renderQueueTable();
}

function queueCancel() {
  const currentToken = DBSync.getToken();
  const bookings = DBSync.getBookings();
  const booking = bookings.find(b => parseInt(b.token) === currentToken && (b.status === 'processing' || b.status === 'approved' || b.status === 'waiting' || b.status === 'pending'));

  if (!booking) { notify('No active token to cancel.', 'error'); return; }

  booking.status = 'cancelled';
  DBSync.setBookings(bookings);

  logActivity('Cancelled Token', currentToken, 'Success');
  notify('Token #' + String(currentToken).padStart(2, '0') + ' cancelled.', 'error');
  refreshQueueControl();
  refreshDashboard();
  renderQueueTable();
}

function queueRecall() {
  notify('Recall announced: Token #' + String(DBSync.getToken()).padStart(2, '0') + ', please proceed to counter.', 'info');
  logActivity('Recalled Token', DBSync.getToken(), 'Success');
}

function queueNoShow() {
  const currentToken = DBSync.getToken();
  const bookings = DBSync.getBookings();
  const booking = bookings.find(b => parseInt(b.token) === currentToken && (b.status === 'processing' || b.status === 'approved' || b.status === 'waiting'));

  if (!booking) { notify('No active token to mark as no-show.', 'error'); return; }

  booking.status = 'cancelled';
  DBSync.setBookings(bookings);

  logActivity('Marked No-Show', currentToken, 'Success');
  notify('Token #' + String(currentToken).padStart(2, '0') + ' marked as no-show.', 'warning');
  refreshQueueControl();
  refreshDashboard();
  renderQueueTable();
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

function queueUpdateToken() {
  const val = prompt('Enter token number to set as current:');
  if (val && !isNaN(val) && val > 0) {
    DBSync.setToken(parseInt(val));
    notify('Current token updated to #' + String(val).padStart(2, '0'), 'success');
    logActivity('Updated Token', val, 'Success');
    refreshQueueControl();
    refreshDashboard();
  }
}

function quickProcess(bookingId) {
  const bookings = DBSync.getBookings();
  const b = bookings.find(x => x.bookingId === bookingId);
  if (!b) return;
  b.status = 'processing';
  DBSync.setBookings(bookings);
  DBSync.setToken(parseInt(b.token));
  logActivity('Processed Token', b.token, 'Success');
  renderQueueTable();
  refreshQueueControl();
  refreshDashboard();
}

function quickComplete(bookingId) {
  const bookings = DBSync.getBookings();
  const b = bookings.find(x => x.bookingId === bookingId);
  if (!b) return;
  b.status = 'completed';
  DBSync.setBookings(bookings);
  logActivity('Quick Completed', b.token, 'Success');
  renderQueueTable();
  refreshQueueControl();
  refreshDashboard();
}

function quickCancel(bookingId) {
  const bookings = DBSync.getBookings();
  const b = bookings.find(x => x.bookingId === bookingId);
  if (!b) return;
  b.status = 'cancelled';
  DBSync.setBookings(bookings);
  logActivity('Quick Cancelled', b.token, 'Success');
  renderQueueTable();
  refreshQueueControl();
  refreshDashboard();
}

// ============================================
// BOOKINGS TABLE
// ============================================
function renderBookingsTable() {
  let bookings = DBSync.getBookings();
  const search = (document.getElementById('bookingsSearch')?.value || '').toLowerCase();
  const dateFilter = document.getElementById('bookingsDateFilter')?.value || '';
  const serviceFilter = document.getElementById('bookingsServiceFilter')?.value || '';
  const statusFilter = document.getElementById('bookingsStatusFilter')?.value || '';

  if (search) bookings = bookings.filter(b => b.name?.toLowerCase().includes(search) || b.email?.toLowerCase().includes(search) || b.token?.includes(search) || b.bookingId?.toLowerCase().includes(search));
  if (dateFilter) bookings = bookings.filter(b => b.date === dateFilter);
  if (serviceFilter) bookings = bookings.filter(b => b.service === serviceFilter);
  if (statusFilter) bookings = bookings.filter(b => b.status === statusFilter);

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
  const dates = [...new Set(bookings.map(b => b.date).filter(Boolean))].sort().reverse();
  const dateSel = document.getElementById('bookingsDateFilter');
  const curVal = dateSel.value;
  dateSel.innerHTML = '<option value="">All Dates</option>' + dates.map(d => `<option value="${d}" ${d === curVal ? 'selected' : ''}>${new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</option>`).join('');

  const services = [...new Set(bookings.map(b => b.service).filter(Boolean))];
  const svcSel = document.getElementById('bookingsServiceFilter');
  const curSvc = svcSel.value;
  svcSel.innerHTML = '<option value="">All Services</option>' + services.map(s => `<option value="${s}" ${s === curSvc ? 'selected' : ''}>${s}</option>`).join('');
}

function sortBookings(field) {
  if (bookingsSortField === field) bookingsSortDir = bookingsSortDir === 'asc' ? 'desc' : 'asc';
  else { bookingsSortField = field; bookingsSortDir = 'asc'; }
  renderBookingsTable();
}

// ============================================
// CALENDAR
// ============================================
function renderCalendar() {
  const year = calViewDate.getFullYear();
  const month = calViewDate.getMonth();

  document.getElementById('calMonthLabel').textContent = new Date(year, month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date().toISOString().split('T')[0];

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

    let cls = 'db-calendar-day';
    if (isToday) cls += ' today';
    if (dayOfWeek === 0) cls += ' other-month';

    html += `<div class="${cls}" onclick="toggleCalendarDate('${dateStr}')">
      <span>${day}</span>
      <div class="slot-info ${remaining > 0 ? 'available' : 'full'}">${bookedCount}/${dailyCap}</div>
    </div>`;
  }

  document.getElementById('calGrid').innerHTML = html;

  // Today's stats
  const todayBookings = bookings.filter(b => b.date === today);
  document.getElementById('calAvailableSlots').value = dailyCap + ' max';
  document.getElementById('calBookedSlots').value = todayBookings.length + ' booked';
  document.getElementById('calRemainingSlots').value = Math.max(0, dailyCap - todayBookings.length) + ' remaining';
}

function calNavigate(dir) {
  if (dir === 0) { calViewDate = new Date(); }
  else { calViewDate.setMonth(calViewDate.getMonth() + dir); }
  renderCalendar();
}

function toggleCalendarDate(dateStr) {
  notify('Date: ' + new Date(dateStr + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + ' — Click settings to adjust capacity.', 'info');
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
  const storedCustomers = DBSync.getCustomers();
  const search = (document.getElementById('customerSearch')?.value || '').toLowerCase();

  // Build customer map from bookings (current data)
  const customerMap = {};
  bookings.forEach(b => {
    if (!b.email) return;
    if (!customerMap[b.email]) customerMap[b.email] = { email: b.email, name: b.name || 'Unknown', aadhaar: b.aadhaarLast4 || b.aadhaar || '--', bookings: [], stored: false };
    customerMap[b.email].bookings.push(b);
    if (b.name && !customerMap[b.email].name.startsWith(b.name)) customerMap[b.email].name = b.name;
  });

  // Merge in stored customers (preserved from previous resets)
  storedCustomers.forEach(sc => {
    if (!sc.email) return;
    if (customerMap[sc.email]) {
      if (!customerMap[sc.email].stored) customerMap[sc.email].stored = true;
    } else {
      customerMap[sc.email] = {
        email: sc.email,
        name: sc.name || 'Unknown',
        aadhaar: sc.aadhaar || '--',
        bookings: [],
        stored: true
      };
    }
  });

  let customers = Object.values(customerMap);
  if (search) customers = customers.filter(c => c.name.toLowerCase().includes(search) || c.email.toLowerCase().includes(search));

  customers.sort((a, b) => b.bookings.length - a.bookings.length);

  const tbody = document.getElementById('customerTableBody');
  tbody.innerHTML = customers.map(c => {
    const lastBooking = c.bookings.length > 0 ? c.bookings.sort((a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date))[0] : null;
    const lastDate = lastBooking?.date ? new Date(lastBooking.date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : (c.lastBooking ? new Date(c.lastBooking + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '--');
    const active = c.bookings.some(b => b.status === 'approved' || b.status === 'pending' || b.status === 'processing');
    const initials = c.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    return `<tr>
      <td><div style="display:flex;align-items:center;gap:10px;"><div style="width:32px;height:32px;border-radius:8px;background:linear-gradient(135deg,var(--db-accent),#6366f1);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;color:#fff;">${initials}</div><span class="name-cell">${c.name}</span></div></td>
      <td>${c.email}</td>
      <td style="font-family:'Space Grotesk',sans-serif;letter-spacing:0.05em;">xxxx xxxx ${c.aadhaar}</td>
      <td>${c.bookings.length + (c.totalBookings || 0)}</td>
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
  if (activityLog.length > 200) activityLog = activityLog.slice(0, 200);
  saveActivityLog();
}

function renderActivity() {
  const search = (document.getElementById('activitySearch')?.value || '').toLowerCase();
  const filter = document.getElementById('activityFilter')?.value || '';
  let logs = [...activityLog];

  if (search) logs = logs.filter(l => l.action.toLowerCase().includes(search) || l.token?.includes(search) || l.admin?.toLowerCase().includes(search));
  if (filter) logs = logs.filter(l => l.action.toLowerCase().includes(filter) || l.result.toLowerCase() === filter);

  const el = document.getElementById('activityList');
  el.innerHTML = logs.slice(0, 50).map(l => {
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
// ANALYTICS CHARTS
// ============================================
function initCharts() {
  // Only init if section is visible
  if (!document.getElementById('section-analytics')?.classList.contains('active')) return;
  if (!document.getElementById('chartDailyBookings')) return;

  const isDark = true;
  const textColor = '#94a3b8';
  const gridColor = 'rgba(255,255,255,0.05)';

  const commonOpts = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { labels: { color: textColor, font: { size: 11, family: 'Inter' } } } },
    scales: { x: { grid: { color: gridColor }, ticks: { color: textColor, font: { size: 10 } } },
              y: { grid: { color: gridColor }, ticks: { color: textColor, font: { size: 10 } }, beginAtZero: true } }
  };

  const bookings = DBSync.getBookings();

  // Daily Bookings (last 7 days)
  const dailyLabels = [];
  const dailyData = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const ds = d.toISOString().split('T')[0];
    dailyLabels.push(d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' }));
    dailyData.push(bookings.filter(b => b.date === ds).length);
  }
  if (charts.daily) charts.daily.destroy();
  charts.daily = new Chart(document.getElementById('chartDailyBookings'), {
    type: 'bar',
    data: { labels: dailyLabels, datasets: [{ label: 'Bookings', data: dailyData, backgroundColor: 'rgba(59,130,246,0.3)', borderColor: '#3b82f6', borderWidth: 1, borderRadius: 4 }] },
    options: { ...commonOpts, plugins: { legend: { display: false } } }
  });

  // Service Distribution
  const svcMap = {}; bookings.forEach(b => { const s = b.service || 'Other'; svcMap[s] = (svcMap[s] || 0) + 1; });
  const svcLabels = Object.keys(svcMap); const svcData = Object.values(svcMap);
  const colors = ['#3b82f6', '#22c55e', '#eab308', '#f97316', '#a855f7', '#ef4444', '#06b6d4'];
  if (charts.services) charts.services.destroy();
  charts.services = new Chart(document.getElementById('chartServices'), {
    type: 'doughnut',
    data: { labels: svcLabels, datasets: [{ data: svcData, backgroundColor: colors.slice(0, svcLabels.length), borderWidth: 0 }] },
    options: { ...commonOpts, cutout: '65%', plugins: { legend: { position: 'right', labels: { color: textColor, font: { size: 10 } } } } }
  });

  // Weekly Traffic
  const weekLabels = []; const weekData = [];
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  dayNames.forEach((d, i) => { weekLabels.push(d); weekData.push(bookings.filter(b => { const bd = new Date(b.date + 'T00:00:00'); return bd.getDay() === i; }).length); });
  if (charts.weekly) charts.weekly.destroy();
  charts.weekly = new Chart(document.getElementById('chartWeekly'), {
    type: 'line',
    data: { labels: weekLabels, datasets: [{ label: 'Bookings', data: weekData, borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,0.1)', fill: true, tension: 0.4, pointRadius: 3, pointBackgroundColor: '#22c55e' }] },
    options: { ...commonOpts, plugins: { legend: { display: false } } }
  });

  // Cancellation Rate
  const total = bookings.length; const cancelled = bookings.filter(b => b.status === 'cancelled').length;
  if (charts.cancellation) charts.cancellation.destroy();
  charts.cancellation = new Chart(document.getElementById('chartCancellation'), {
    type: 'doughnut',
    data: { labels: ['Completed/Active', 'Cancelled'], datasets: [{ data: [total - cancelled, cancelled], backgroundColor: ['#22c55e', '#ef4444'], borderWidth: 0 }] },
    options: { ...commonOpts, cutout: '65%', plugins: { legend: { position: 'right', labels: { color: textColor, font: { size: 10 } } } } }
  });

  // Peak Hours
  const hours = {}; for (let h = 8; h <= 18; h++) hours[h] = 0;
  bookings.forEach(b => { if (b.createdAt) { const h = new Date(b.createdAt).getHours(); if (h >= 8 && h <= 18) hours[h]++; } });
  if (charts.peak) charts.peak.destroy();
  charts.peak = new Chart(document.getElementById('chartPeakHours'), {
    type: 'bar',
    data: { labels: Object.keys(hours).map(h => h + ':00'), datasets: [{ label: 'Bookings', data: Object.values(hours), backgroundColor: 'rgba(168,85,247,0.3)', borderColor: '#a855f7', borderWidth: 1, borderRadius: 4 }] },
    options: { ...commonOpts, plugins: { legend: { display: false } } }
  });

  // Avg Wait Time by Service
  const waitMap = {}; bookings.forEach(b => { const s = b.service || 'Other'; if (!waitMap[s]) waitMap[s] = { total: 0, count: 0 }; waitMap[s].total += 15; waitMap[s].count++; });
  const waitLabels = Object.keys(waitMap); const waitData = waitLabels.map(s => Math.round(waitMap[s].total / waitMap[s].count));
  if (charts.wait) charts.wait.destroy();
  charts.wait = new Chart(document.getElementById('chartWaitTime'), {
    type: 'bar',
    data: { labels: waitLabels, datasets: [{ label: 'Avg Wait (min)', data: waitData, backgroundColor: 'rgba(6,182,212,0.3)', borderColor: '#06b6d4', borderWidth: 1, borderRadius: 4 }] },
    options: { ...commonOpts, plugins: { legend: { display: false } } }
  });
}

// ============================================
// TODAY CHART (mini)
// ============================================
function updateTodayChart(todayBookings) {
  if (!document.getElementById('chartToday')) return;
  if (charts.today) charts.today.destroy();
  const statuses = ['approved', 'processing', 'completed', 'cancelled'];
  const data = statuses.map(s => todayBookings.filter(b => b.status === s).length);
  const colors = ['rgba(59,130,246,0.3)', 'rgba(249,115,22,0.3)', 'rgba(34,197,94,0.3)', 'rgba(239,68,68,0.3)'];
  const borderColors = ['#3b82f6', '#f97316', '#22c55e', '#ef4444'];
  charts.today = new Chart(document.getElementById('chartToday'), {
    type: 'bar',
    data: { labels: ['Waiting', 'Processing', 'Completed', 'Cancelled'], datasets: [{ data, backgroundColor: colors, borderColor: borderColors, borderWidth: 1, borderRadius: 4 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
      scales: { x: { grid: { display: false }, ticks: { color: '#94a3b8', font: { size: 10 } } },
                y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8', font: { size: 10 } }, beginAtZero: true } }
    }
  });
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

function renderAdmins() {
  const el = document.getElementById('adminList');
  if (!el) return;
  if (!admins.length) {
    el.innerHTML = '<div style="text-align:center;padding:24px;color:var(--db-text3);">No admins configured.</div>';
    return;
  }
  el.innerHTML = admins.map(a => {
    const roleLabel = a.role ? a.role.charAt(0).toUpperCase() + a.role.slice(1) : 'Staff';
    return `<div class="db-role-card">
      <div class="db-role-header">
        <div><div class="db-role-name">${a.name || 'Unknown'}</div><div style="font-size:12px;color:var(--db-text3);margin-top:2px;">${a.email || '--'}</div></div>
        <span class="db-role-badge ${a.role || 'staff'}">${roleLabel}</span>
      </div>
    </div>`;
  }).join('');
}

function addAdmin() {
  const name = prompt('Enter admin name:');
  if (!name) return;
  const email = prompt('Enter email:');
  if (!email) return;
  const role = prompt('Enter role (owner/manager/staff):');
  if (!['owner', 'manager', 'staff'].includes(role)) { notify('Invalid role.', 'error'); return; }
  if (window.__adminsRef) {
    window.__adminsRef.add({ name, email, role, added: new Date().toISOString() }).then(() => {
      logActivity('Added Admin: ' + name, '--', 'Success');
      notify('Admin ' + name + ' added.', 'success');
    });
  } else {
    notify('Firestore not available.', 'error');
  }
}

// ============================================
// NOTIFICATIONS
// ============================================
let notifications = [];

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
}

function markAllNotifRead() {
  renderNotifications();
  updateNotifBadge();
  notify('All notifications marked as read.', 'success');
}

function updateNotifBadge() {
  const el = document.getElementById('notifBadgeSidebar');
  if (el) { el.textContent = ''; el.style.display = 'none'; }
}

// ============================================
// SETTINGS
// ============================================
function saveSettings() {
  const settings = {
    centerName: document.getElementById('setCenterName')?.value,
    address: document.getElementById('setAddress')?.value,
    contact: document.getElementById('setContact')?.value,
    workingDays: document.getElementById('setWorkingDays')?.value,
    maxDaily: document.getElementById('setMaxDaily')?.value,
  };
  localStorage.setItem('ds_settings', JSON.stringify(settings));

  const smsConfig = {
    driver: document.getElementById('setSmsDriver')?.value || 'log',
    fast2sms_api_key: document.getElementById('setFast2SmsKey')?.value || '',
    fast2sms_sender_id: document.getElementById('setFast2SmsSender')?.value || 'FTWSMS',
    msg91_auth_key: document.getElementById('setMsg91Key')?.value || '',
    msg91_sender_id: document.getElementById('setMsg91Sender')?.value || 'MSGIND',
    otp_length: parseInt(document.getElementById('setOtpLength')?.value) || 6,
    otp_expiry: parseInt(document.getElementById('setOtpExpiry')?.value) || 300,
    daily_limit: parseInt(document.getElementById('setDailySmsLimit')?.value) || 100,
    sms_template: document.getElementById('setSmsTemplate')?.value || '',
  };

  fetch('api/otp?action=status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ _saveConfig: true, config: smsConfig })
  }).catch(() => {});

  localStorage.setItem('ds_sms_config', JSON.stringify(smsConfig));
  notify('Settings saved successfully.', 'success');
  logActivity('Updated Settings', '--', 'Success');
}

function resetAllData() {
  showConfirmModal(
    'Reset All Data',
    'This will clear all bookings, token counter, activity logs, settings, dates, cache, and OTP data. Customer profiles will be preserved. New bookings will start from token 1. Are you sure?',
    async () => {
      try {
        // Extract customer profiles from current bookings before clearing
        const bookings = DBSync.getBookings();
        const customerMap = {};
        bookings.forEach(b => {
          if (!b.email) return;
          if (!customerMap[b.email]) {
            customerMap[b.email] = {
              email: b.email,
              name: b.name || 'Unknown',
              aadhaar: b.aadhaarLast4 || b.aadhaar || '--',
              lastBooking: b.date || '',
              totalBookings: 0
            };
          }
          customerMap[b.email].totalBookings++;
          if (b.date && b.date > customerMap[b.email].lastBooking) {
            customerMap[b.email].lastBooking = b.date;
          }
        });
        const customers = Object.values(customerMap);

        // Save customers to server before reset
        await fetch(DBSync.API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'setCustomers', customers })
        });

        // Reset server-side data (clears bookings, preserves customers on server)
        await fetch(DBSync.API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'resetExceptCustomers' })
        });

        // Reset local state
        activityLog = [];
        saveActivityLog();

        // Clear all localStorage (including bookings, customers stays in sync doc)
        localStorage.removeItem('ds_bookings');
        localStorage.removeItem('ds_token');
        localStorage.removeItem('ds_dates');
        localStorage.removeItem('ds_activity');
        localStorage.removeItem('ds_settings');
        localStorage.removeItem('ds_cache');
        localStorage.removeItem('ds_sms_config');

        // Store customers locally for display
        localStorage.setItem('ds_customers', JSON.stringify(customers));

        // Reset via DBSync (syncs to Firestore)
        DBSync.setBookings([]);
        DBSync.setToken(0);
        DBSync.setDates([]);
        DBSync.setCache([]);
        DBSync.setActivity([]);
        DBSync.setSettings({});
        DBSync.setCustomers(customers);

        // Reset Firestore token counter so next booking starts at 1
        try {
          if (DBSync._firestoreReady && DBSync._db) {
            await DBSync._db.collection('counters').doc('tokenCounter').set({
              lastTokenNumber: 0,
              updatedAt: new Date().toISOString()
            });
          }
        } catch (e) {
          console.warn('Failed to reset token counter:', e);
        }

        notify('All data reset. Customer profiles preserved. Tokens will start from 1.', 'success');
        logActivity('Reset All Data (customers preserved, token restarts from 1)', '--', 'Success');

        fullRefresh();
      } catch (e) {
        notify('Reset failed: ' + e.message, 'error');
      }
    }
  );
}

// ============================================
// NOTIFICATION HELPER
// ============================================
function notify(msg, type) {
  let n = document.getElementById('_dbNotif');
  if (!n) {
    n = document.createElement('div');
    n.id = '_dbNotif';
    n.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:9999;padding:12px 20px;border-radius:10px;font-size:13px;font-weight:500;font-family:Inter,sans-serif;max-width:380px;transition:all 0.3s;transform:translateY(20px);opacity:0;box-shadow:0 8px 32px rgba(0,0,0,0.4);';
    document.body.appendChild(n);
  }

  const colors = {
    success: { bg: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', color: '#22c55e' },
    error: { bg: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444' },
    warning: { bg: 'rgba(234,179,8,0.15)', border: '1px solid rgba(234,179,8,0.3)', color: '#eab308' },
    info: { bg: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)', color: '#3b82f6' },
  };
  const c = colors[type] || colors.info;

  n.textContent = msg;
  n.style.background = c.bg;
  n.style.border = c.border;
  n.style.color = c.color;
  n.style.transform = 'translateY(0)';
  n.style.opacity = '1';

  clearTimeout(n._t);
  n._t = setTimeout(() => {
    n.style.transform = 'translateY(20px)';
    n.style.opacity = '0';
  }, 3000);
}

// ============================================
// CONFIRMATION MODAL
// ============================================
let _confirmCallback = null;

function showConfirmModal(title, message, callback) {
  _confirmCallback = callback || null;
  const overlay = document.getElementById('confirmModalOverlay');
  const titleEl = document.getElementById('modalTitle');
  const msgEl = document.getElementById('modalMsg');
  if (titleEl) titleEl.textContent = title;
  if (msgEl) msgEl.textContent = message;
  if (overlay) overlay.style.display = 'flex';
}

function closeConfirmModal(result, event) {
  if (event && event.target !== document.getElementById('confirmModalOverlay')) {
    if (event.target.closest('.modal-card')) return;
  }
  const overlay = document.getElementById('confirmModalOverlay');
  if (overlay) overlay.style.display = 'none';
  if (result === false && _confirmCallback) {
    _confirmCallback = null;
  }
}

function executeConfirmModal() {
  if (typeof _confirmCallback === 'function') {
    const cb = _confirmCallback;
    _confirmCallback = null;
    closeConfirmModal(true);
    cb();
  }
}
