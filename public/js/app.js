// ============================================
// DATA STORE (localStorage-based for demo)
// ============================================
const DB = {
  bookings: [],
  currentToken: 0,
  enabledDates: [],

  load() {
    try {
      this.bookings = DBSync.getBookings();
      this.currentToken = DBSync.getToken();
      this.enabledDates = DBSync.getDates();
    } catch(e) {}
  },

  save() {
    try {
      DBSync.setBookings(this.bookings);
      DBSync.setToken(this.currentToken);
      DBSync.setDates(this.enabledDates);
    } catch(e) {}
  },

  getEnabledDates() {
    return this.enabledDates.filter(d => d.enabled);
  },

  async addBooking(data) {
    let token;
    try { token = String(await DBSync.getNextToken()); } catch(e) { token = String(Date.now()).slice(-4); }
    const bid = 'DS' + Date.now().toString().slice(-6) + Math.floor(Math.random()*100);
    const booking = { ...data, token, bookingId: bid, status: 'approved', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    this.bookings.push(booking);
    if (window.__bookingsRef) {
      window.__bookingsRef.add(booking).catch(e => {
        try { DBSync.setBookings(this.bookings); } catch(ex) {}
      });
    } else {
      try { DBSync.setBookings(this.bookings); } catch(ex) {}
    }
    return booking;
  },

  getByEmail(email) {
    return this.bookings.filter(b => b.email === email && b.status !== 'cancelled');
  },

  getActiveByEmail(email) {
    return this.bookings.find(b => b.email === email && (b.status === 'pending' || b.status === 'approved'));
  },

  getActiveByAadhaar(aadhaar) {
    return this.bookings.find(b => b.aadhaarLast4 === aadhaar && (b.status === 'pending' || b.status === 'approved'));
  },

  getByAadhaar(aadhaar) {
    return this.bookings.filter(b => b.aadhaarLast4 === aadhaar && b.status !== 'cancelled');
  }
};

DB.load();

// ============================================
// BUTTON LOADING STATE UTILITY
// ============================================
function setBtnLoading(btn, loading) {
  if (!btn) return;
  if (loading) {
    btn.classList.add('btn-loading');
    btn.disabled = true;
  } else {
    btn.classList.remove('btn-loading');
    btn.disabled = false;
  }
}

function findBtn(el) {
  if (!el) return null;
  return el.tagName === 'BUTTON' ? el : el.querySelector('button');
}

// ============================================
// SECTION SKELETON LOADERS
// ============================================
function showSkeleton(containerId, count, type) {
  var container = document.getElementById(containerId);
  if (!container) return;
  if (type === 'card') {
    container.innerHTML = '<div class="skeleton-grid">' + Array(count).fill('<div class="skeleton-card"></div>').join('') + '</div>';
  } else if (type === 'line') {
    container.innerHTML = Array(count).fill('<div class="skeleton-line"></div>').join('');
  } else if (type === 'block') {
    container.innerHTML = Array(count).fill('<div class="skeleton-block"></div>').join('');
  }
}

function hideSkeleton(containerId) {
  var container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';
}

// ============================================
// PAGE LOADER CONTROL
// ============================================
function showPageLoader() {
  var loader = document.getElementById('pageLoader');
  if (loader) {
    loader.classList.add('show');
  }
}
function hidePageLoader() {
  var loader = document.getElementById('pageLoader');
  if (loader) {
    loader.classList.remove('show');
  }
}

function withTimeout(promise, ms, label) {
  var timer;
  var timeout = new Promise(function(_, reject) {
    timer = setTimeout(function() {
      reject(new Error(label + ' timed out after ' + ms + 'ms'));
    }, ms);
  });
  return Promise.race([promise, timeout]).then(function(result) {
    clearTimeout(timer);
    return result;
  }, function(err) {
    clearTimeout(timer);
    throw err;
  });
}

function archiveBooking(booking) {
  if (!booking || (booking.status !== 'completed' && booking.status !== 'cancelled')) return;
  try {
    const cache = typeof DBSync !== 'undefined' ? DBSync.getCache() : [];
    if (!cache.find(b => b.bookingId === booking.bookingId)) {
      cache.push({ ...booking, archivedAt: new Date().toISOString() });
      if (typeof DBSync !== 'undefined') DBSync.setCache(cache);
    }
  } catch(e) {}
}

// Firestore real-time sync for public data
function initPublicFirestoreListeners() {
  if (typeof window.__bookingsRef === 'undefined' || typeof window.__queueRef === 'undefined') {
    setTimeout(initPublicFirestoreListeners, 800);
    return;
  }
  var dataLoaded = 0;
  // Keep local DB in sync with Firestore bookings
  window.__bookingsRef.onSnapshot(snap => {
    DB.bookings = [];
    snap.forEach(doc => DB.bookings.push({ id: doc.id, ...doc.data() }));
    updateHeroDisplay();
    if (document.getElementById('checkTokenModal')?.classList.contains('open')) {
      renderCheckTokenStep(checkTokenStep);
    }
    dataLoaded++;
    if (dataLoaded >= 2) hidePageLoader();
  }, function() { dataLoaded++; if (dataLoaded >= 2) hidePageLoader(); });

  // Track current token from queue collection
  window.__queueRef.onSnapshot(snap => {
    snap.forEach(doc => { DB.currentToken = doc.data().currentToken || 1; });
    updateHeroDisplay();
    dataLoaded++;
    if (dataLoaded >= 2) hidePageLoader();
  }, function() { dataLoaded++; if (dataLoaded >= 2) hidePageLoader(); });
}
initPublicFirestoreListeners();

// Flash dot to show live connection
let liveDot = null;
function updateLiveIndicator() {
  const q = document.getElementById('queueDisplay');
  if (!q) return;
  if (!liveDot) {
    liveDot = document.createElement('span');
    liveDot.style.cssText = 'display:inline-block;width:6px;height:6px;border-radius:50%;background:#22c55e;margin-left:6px;animation:pulse-green 2s infinite;vertical-align:middle;';
    q.querySelector('.section-tag')?.appendChild(liveDot);
  }
}

// ============================================
// CURRENT SESSION
// ============================================
let sessionBookingData = {};
let currentBookingStep = 1;
let bookingStep = 1;
let checkTokenStep = 1;
let verifiedAadhaar = null;
let selectedDate = null;

// ============================================
// NOTIFICATIONS
// ============================================
function notify(msg, type = 'info') {
  const n = document.getElementById('notif');
  n.textContent = msg;
  n.className = 'notification ' + type;
  n.style.display = 'flex';
  clearTimeout(n._t);
  n._t = setTimeout(() => n.style.display = 'none', 3500);
}

// ============================================
// NAV
// ============================================
function toggleMobileMenu() {
  document.getElementById('mobileMenu').classList.toggle('open');
  document.getElementById('hamburger').classList.toggle('active');
}

function closeMobileMenu() {
  document.getElementById('mobileMenu').classList.remove('open');
  document.getElementById('hamburger').classList.remove('active');
}

document.addEventListener('click', function(e) {
  const mm = document.getElementById('mobileMenu');
  const hb = document.getElementById('hamburger');
  if (mm.classList.contains('open') && !mm.contains(e.target) && !hb.contains(e.target)) {
    mm.classList.remove('open');
    hb.classList.remove('active');
  }
});

window.addEventListener('scroll', function() {
  document.getElementById('mainNav').style.background =
    window.scrollY > 40 ? 'rgba(8,12,20,0.95)' : 'rgba(8,12,20,0.8)';
});

// ============================================
// SMOOTH SCROLL
// ============================================
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', function(e) {
    const href = this.getAttribute('href');
    if (href === '#') return;
    const target = document.querySelector(href);
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});

// ============================================
// SCROLL REVEAL
// ============================================
const observer = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (e.isIntersecting) e.target.classList.add('visible');
  });
}, { threshold: 0.1 });

document.querySelectorAll('.reveal').forEach(el => observer.observe(el));

// ============================================
// STATS COUNTER
// ============================================
function animateCounter(el, target, suffix = '') {
  let current = 0;
  const step = target / 60;
  const timer = setInterval(() => {
    current = Math.min(current + step, target);
    el.textContent = Math.floor(current).toLocaleString() + suffix;
    if (current >= target) clearInterval(timer);
  }, 20);
}

const statsObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.querySelectorAll('[data-target]').forEach(el => {
        const target = parseInt(el.dataset.target);
        const suffix = el.dataset.suffix || '';
        animateCounter(el, target, suffix);
      });
      statsObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.3 });

const statsSection = document.querySelector('.stats-grid');
if (statsSection) statsObserver.observe(statsSection);

// ============================================
// REVIEWS SLIDER
// ============================================
function scrollReviews(dir) {
  const track = document.getElementById('reviewsTrack');
  track.scrollBy({ left: dir * 340, behavior: 'smooth' });
}

// ============================================
// SERVICE DROPDOWN
// ============================================
window.toggleCustomDropdown = function() {
  const dd = document.getElementById('serviceDropdown');
  dd.classList.toggle('open');
  document.addEventListener('click', closeDropdownOutside);
};
function closeDropdownOutside(e) {
  const dd = document.getElementById('serviceDropdown');
  if (!dd.contains(e.target)) { dd.classList.remove('open'); document.removeEventListener('click', closeDropdownOutside); }
}
window.selectService = function(value, el) {
  document.querySelectorAll('.custom-dropdown-item').forEach(i => i.classList.remove('selected'));
  if (el) el.classList.add('selected');
  document.getElementById('serviceDropdown').classList.remove('open');
  const label = el ? el.textContent : '-- Choose a Service --';
  document.querySelector('.custom-dropdown-selected').textContent = label;
  handleServiceSelect(value);
};

function handleServiceSelect(val) {
  const note = document.getElementById('comingSoonNote');
  if (val === 'aadhaar') {
    note.style.display = 'none';
    var vt = sessionStorage.getItem('vt') || '';
    var r = Math.random().toString(36).slice(2, 8);
    window.location.href = 'aadhaar-portal.html?vt=' + vt + '&r=' + r;
  } else if (val && val !== '') {
    note.style.display = 'block';
  } else {
    note.style.display = 'none';
  }
}

// ============================================
// ACCORDION
// ============================================
function toggleAccordion(header) {
  const item = header.parentElement;
  item.classList.toggle('open');
}

// ============================================
// HERO TOKEN DISPLAY
// ============================================
function updateHeroDisplay() {
  const ct = DB.currentToken;
  const heroTokenEl = document.getElementById('heroCurrentToken');
  if (heroTokenEl) heroTokenEl.textContent = String(ct).padStart(2, '0');
  const inQueue = DB.bookings.filter(b => b.status === 'approved' || b.status === 'pending').length;
  const heroQueueEl = document.getElementById('heroInQueue');
  if (heroQueueEl) heroQueueEl.textContent = inQueue;
}

updateHeroDisplay();
setInterval(updateHeroDisplay, 30000);

// ============================================
// EMAIL VERIFICATION via Firebase Email Link
// ============================================
async function sendOTP(email) {
  return await window.sendOTP(email);
}

async function verifyOTP(code) {
  return await window.verifyOTP(code);
}

function setupOTPInputs(prefix) {
  const inputs = document.querySelectorAll('.' + prefix + '-otp');
  inputs.forEach((inp, i) => {
    inp.addEventListener('input', () => {
      const v = inp.value.replace(/\D/g, '');
      inp.value = v.slice(0, 1);
      if (v && i < inputs.length - 1) inputs[i+1].focus();
    });
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !inp.value && i > 0) inputs[i-1].focus();
    });
    inp.addEventListener('paste', (e) => {
      e.preventDefault();
      const text = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '');
      inputs.forEach((inp2, j) => { inp2.value = text[j] || ''; });
    });
  });
}

function getOTPValue(prefix) {
  return [...document.querySelectorAll('.' + prefix + '-otp')].map(i => i.value).join('');
}

// ============================================
// BOOKING MODAL
// ============================================
function openBooking(preserveData) {
  currentBookingStep = 1;
  if (!preserveData) {
    sessionBookingData = {};
    selectedDate = null;
  }
  document.getElementById('bookingModal').classList.add('open');
  renderBookingStep(1);
}

function closeBooking() {
  document.getElementById('bookingModal').classList.remove('open');
}

function renderBookingStep(step) {
  currentBookingStep = step;
  const body = document.getElementById('bookingModalBody');

  // 3-step indicator: Step 1 = Your Details, Step 2 = Choose Date, Step 3 = Confirmed
  const stepIndicator = `
    <div class="step-indicator">
      <div class="step-dot ${step > 1 ? 'done' : step === 1 ? 'active' : 'pending'}">${step > 1 ? '<i class=\"fas fa-check\" style=\"font-size:13px;\"></i>' : '1'}</div>
      <div class="step-line ${step > 1 ? 'done' : ''}"></div>
      <div class="step-dot ${step > 2 ? 'done' : step === 2 ? 'active' : 'pending'}">${step > 2 ? '<i class=\"fas fa-check\" style=\"font-size:13px;\"></i>' : '2'}</div>
      <div class="step-line ${step > 2 ? 'done' : ''}"></div>
      <div class="step-dot ${step === 3 ? 'active' : 'pending'}">3</div>
    </div>
  `;

  if (step === 1) {
    // Step 1: Service selection + Phone + Aadhaar last 4 — all on same page
    const savedService = sessionBookingData.service || '';
    document.getElementById('bookingModalTitle').textContent = t('book_title');
    body.innerHTML = stepIndicator + `
      <!-- Service Selection -->
      <div class="form-group">
        <label class="form-label">${t('select_service')}</label>
        <select class="form-select" id="bookService">
          <option value="">${t('booking_service_choose')}</option>
          <option value="Mobile Number Update" ${savedService === 'Mobile Number Update' ? 'selected' : ''}>${t('mobile_update')}</option>
          <option value="Address Update" ${savedService === 'Address Update' ? 'selected' : ''}>${t('addr_update')}</option>
          <option value="Name Correction" ${savedService === 'Name Correction' ? 'selected' : ''}>${t('name_correction')}</option>
          <option value="Date of Birth Update" ${savedService === 'Date of Birth Update' ? 'selected' : ''}>${t('dob_update')}</option>
          <option value="Biometric Update" ${savedService === 'Biometric Update' ? 'selected' : ''}>${t('bio_update')}</option>
          <option value="Other Aadhaar Services" ${savedService === 'Other Aadhaar Services' ? 'selected' : ''}>${t('other_aadhaar')}</option>
        </select>
      </div>

      <div style="height:1px; background:var(--glass-border); margin:20px 0;"></div>

      <!-- Email -->
      <div class="form-group">
        <label class="form-label">${t('email_label')}</label>
        <input type="email" class="form-input" id="bookEmail" placeholder="${t('email_plc')}"
          value="${sessionBookingData.email || ''}"
          style="width:100%;padding:13px 14px;background:transparent;border:1px solid var(--glass-border);border-radius:10px;color:var(--text);font-size:14px;font-family:inherit;outline:none;transition:border-color 0.2s;"
          onfocus="this.style.borderColor='rgba(59,130,246,0.5)'"
          onblur="this.style.borderColor='var(--glass-border)'">
      </div>

      <!-- Aadhaar Number — last 4 digits -->
      <div class="form-group">
        <label class="form-label">${t('aadhaar_label')}</label>
        <div style="position:relative;">
          <div style="display:flex; align-items:center; gap:0; background:transparent; border:1px solid var(--glass-border); border-radius:10px; overflow:hidden; transition:border-color 0.2s;" id="aadhaarFieldWrap">
            <span style="padding:13px 14px; font-size:14px; color:var(--text3); letter-spacing:0.1em; font-family:'Space Grotesk',sans-serif; border-right:1px solid var(--glass-border); background:transparent; user-select:none; flex-shrink:0;">xxxx xxxx</span>
            <input type="text" id="bookAadhaarLast4" placeholder="XXXX" maxlength="4" inputmode="numeric"
              value="${sessionBookingData.aadhaarLast4 || ''}"
              style="flex:1; background:transparent; border:none; outline:none; padding:13px 14px; color:var(--text); font-size:14px; font-family:'Space Grotesk',sans-serif; letter-spacing:0.15em; font-weight:600;"
              onfocus="document.getElementById('aadhaarFieldWrap').style.borderColor='rgba(59,130,246,0.5)'"
              onblur="document.getElementById('aadhaarFieldWrap').style.borderColor='var(--glass-border)'"
            >
          </div>
          <p style="font-size:12px; color:var(--text3); margin-top:6px;">${t('aadhaar_hint')}</p>
        </div>
      </div>

      <!-- OTP section (hidden until Send OTP is clicked) -->
      <div id="bookOTPSection" style="display:none;">
        <div style="height:1px; background:var(--glass-border); margin:4px 0 20px;"></div>
        <p style="font-size:13px; color:var(--text3); margin-bottom:16px;">${t('otp_hint')}</p>
        <div class="otp-grid">
          <input type="text" class="otp-input book-otp" maxlength="1" inputmode="numeric">
          <input type="text" class="otp-input book-otp" maxlength="1" inputmode="numeric">
          <input type="text" class="otp-input book-otp" maxlength="1" inputmode="numeric">
          <input type="text" class="otp-input book-otp" maxlength="1" inputmode="numeric">
          <input type="text" class="otp-input book-otp" maxlength="1" inputmode="numeric">
          <input type="text" class="otp-input book-otp" maxlength="1" inputmode="numeric">
        </div>
        <button class="btn-primary btn-full" onclick="verifyBookingOTP()" style="margin-top:12px;">${t('verify_otp_btn')}</button>
        <p style="text-align:center; margin-top:12px;">
          <a href="#" onclick="resendOTP(); return false;" style="color:var(--accent); font-size:13px;">${t('resend_otp')}</a>
        </p>
      </div>

      <div id="bookSendOTPBtn" style="margin-top:8px;">
        <button class="btn-primary btn-full" onclick="sendBookingOTP()">${t('send_otp_btn')}</button>
      </div>
    `;

  } else if (step === 2) {
    // Step 2: Date picker
    const dates = DB.getEnabledDates();
    const dateOptions = dates.length === 0
      ? '<p style="color:var(--text3); font-size:14px; text-align:center; padding:20px;">' + t('no_dates') + '</p>'
      : dates.map(d => {
          const date = new Date(d.date + 'T00:00:00');
          const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
          const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
          const isSelected = sessionBookingData.date === d.date;
          return `<div class="date-btn ${isSelected ? 'selected' : ''}" onclick="selectDate('${d.date}', this)">
            <div class="date-btn-day">${days[date.getDay()]}</div>
            <div class="date-btn-num">${date.getDate()}</div>
            <div class="date-btn-month">${months[date.getMonth()]}</div>
          </div>`;
        }).join('');

    document.getElementById('bookingModalTitle').textContent = t('choose_date_title');
    body.innerHTML = stepIndicator + `
      <p style="font-size:14px; color:var(--text2); margin-bottom:20px;">${t('select_date_hint')}</p>
      <div class="date-grid">${dateOptions}</div>
      <div style="display:flex; gap:12px; margin-top:24px;">
        <button class="btn-secondary" onclick="renderBookingStep(1)" style="flex:1; justify-content:center;">${t('back_btn')}</button>
        <button class="btn-primary" onclick="submitBookingStep2()" style="flex:2; justify-content:center;">${t('confirm_booking')}</button>
      </div>
    `;

  } else if (step === 3) {
    // Step 3: Confirmation
    const booking = sessionBookingData.confirmedBooking;
    document.getElementById('bookingModalTitle').textContent = t('confirmed_title');

    const d = new Date(booking.date + 'T00:00:00');
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const displayDate = `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;

    body.innerHTML = stepIndicator + `
      <div class="booking-confirm">
        <div class="confirm-stamp-wrap">
          <div class="confirm-stamp">
            <svg class="confirm-stamp-svg" viewBox="0 0 130 130">
              <circle class="bg" cx="65" cy="65" r="62"/>
              <circle class="outer" cx="65" cy="65" r="60"/>
              <circle class="inner" cx="65" cy="65" r="55"/>
              <line class="star" x1="65" y1="7" x2="65" y2="17"/>
              <line class="star" x1="65" y1="113" x2="65" y2="123"/>
              <line class="star" x1="7" y1="65" x2="17" y2="65"/>
              <line class="star" x1="113" y1="65" x2="123" y2="65"/>
              <line class="star" x1="24" y1="24" x2="31" y2="31"/>
              <line class="star" x1="99" y1="99" x2="106" y2="106"/>
              <line class="star" x1="24" y1="106" x2="31" y2="99"/>
              <line class="star" x1="99" y1="31" x2="106" y2="24"/>
            </svg>
            <div class="confirm-stamp-text">
              <span class="main">CONFIRMED</span>
              <span class="sub">BOOKING</span>
            </div>
          </div>
          <div style="width:80px;height:80px;margin:0 auto 16px;">
            <svg viewBox="0 0 80 80" style="width:80px;height:80px;">
              <circle cx="40" cy="40" r="36" fill="none" stroke="rgba(16,185,129,0.3)" stroke-width="3"/>
              <circle cx="40" cy="40" r="36" fill="none" stroke="#34d399" stroke-width="3" stroke-dasharray="226" stroke-dashoffset="226" stroke-linecap="round" class="anim-circle"/>
              <path d="M24 42l12 12 22-24" fill="none" stroke="#34d399" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="56" stroke-dashoffset="56" class="anim-check"/>
            </svg>
          </div>
          <h3 style="font-family:'Space Grotesk',sans-serif;font-size:18px;font-weight:700;margin-bottom:8px;">${t('booking_confirmed')}</h3>
          <p style="font-size:14px;color:var(--text2);margin-bottom:24px;">${t('booking_success')}</p>

          <div style="text-align:center; margin-bottom:24px;">
            <div style="font-size:12px;color:var(--text3);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.1em;">${t('your_token_label')}</div>
            <div style="font-family:'Space Grotesk',sans-serif;font-size:72px;font-weight:700;color:var(--accent);line-height:1;text-shadow:0 0 30px rgba(56,189,248,0.3);">${booking.token}</div>
          </div>

          <div class="booking-id-badge">${t('booking_id_label')}: ${booking.bookingId}</div>

          <div class="booking-detail-grid">
            <div class="booking-detail-row">
              <span class="booking-detail-key">${t('service_label')}</span>
              <span class="booking-detail-val">${booking.service}</span>
            </div>
            <div class="booking-detail-row">
              <span class="booking-detail-key">${t('aadhaar_detail')}</span>
              <span class="booking-detail-val" style="font-family:'Space Grotesk',sans-serif; letter-spacing:0.1em;">xxxx xxxx ${booking.aadhaarLast4}</span>
            </div>
            <div class="booking-detail-row">
              <span class="booking-detail-key">${t('appt_date')}</span>
              <span class="booking-detail-val">${displayDate}</span>
            </div>
            <div class="booking-detail-row">
              <span class="booking-detail-key">${t('status_label')}</span>
              <span class="booking-detail-val text-success">${t('approved')}</span>
            </div>
          </div>
        </div>

        <div style="margin-top:16px;text-align:left;">
          <h4 style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:12px;">${t('instructions_title')}</h4>
          ${t('instructions_body')}
        </div>

        <div style="display:flex;gap:10px;margin-top:24px;">
          <button class="btn-primary btn-full" onclick="closeBooking()" style="flex:1;justify-content:center;">${t('done_btn')}</button>
          <button class="btn-primary btn-full" onclick="window.print()" style="flex:1;justify-content:center;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);">${t('print_btn')}</button>
        </div>
      </div>
    `;
  }
}

async function sendBookingOTP() {
  const email = document.getElementById('bookEmail').value.trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    notify('Please enter a valid email address', 'error');
    return;
  }

  const aadhaarLast4 = document.getElementById('bookAadhaarLast4').value.trim().replace(/\D/g, '');
  if (aadhaarLast4.length !== 4) {
    notify('Please enter the last 4 digits of your Aadhaar', 'error');
    return;
  }

  const existing = DB.getActiveByEmail(email);
  if (existing) {
    notify('You already have an active booking (Token #' + existing.token + '). Please cancel it first or check your token.', 'error');
    return;
  }

  sessionBookingData.email = email;
  sessionBookingData.aadhaarLast4 = aadhaarLast4;

  const btn = document.querySelector('#bookSendOTPBtn button');
  setBtnLoading(btn, true);
  showPageLoader();
  const res = await sendOTP(email);
  setBtnLoading(btn, false);
  hidePageLoader();
  if (res.success) {
    notify('OTP sent to ' + email, 'success');
    document.getElementById('bookSendOTPBtn').style.display = 'none';
    document.getElementById('bookOTPSection').style.display = 'block';
    setTimeout(() => setupOTPInputs('book'), 100);
  } else {
    notify(res.message || 'Failed to send OTP', 'error');
  }
}

async function verifyBookingOTP() {
  const otp = getOTPValue('book');
  if (otp.length !== 6) { notify('Enter the complete 6-digit OTP', 'error'); return; }
  const btn = document.querySelector('#bookingModalBody .btn-primary');
  setBtnLoading(btn, true);
  const result = await verifyOTP(otp);
  setBtnLoading(btn, false);
  if (result.success) {
    notify('Email verified successfully!', 'success');
    renderBookingStep(2);
  } else {
    notify(result.message || 'Incorrect OTP. Please try again.', 'error');
  }
}

function resendOTP() {
  const email = sessionBookingData.email;
  if (email) {
    sendOTP(email).then(res => {
      if (res.success) notify('OTP resent to ' + email, 'success');
      else notify(res.message || 'Failed to resend OTP', 'error');
    });
  }
}

function handleAadhaarGroupInput(input, nextId) {
  input.value = input.value.replace(/\D/g, '');
  if (input.value.length === 4 && nextId) {
    document.getElementById(nextId).focus();
  }
}

function handleAadhaarBackspace(input, prevId) {
  if (input.value.length === 0 && input.selectionStart === 0 && prevId) {
    const prev = document.getElementById(prevId);
    prev.focus();
    prev.value = prev.value.slice(0, -1);
  }
}



async function submitBookingStep2() {
  const service = document.getElementById('bookService') ? document.getElementById('bookService').value : sessionBookingData.service;

  if (!service) { notify('Please select a service', 'error'); return; }

  if (!sessionBookingData.date) {
    notify('Please select an appointment date', 'error');
    return;
  }

  const aadhaarLast4 = sessionBookingData.aadhaarLast4;
  if (!aadhaarLast4 || aadhaarLast4.length !== 4) {
    notify('Aadhaar not verified. Please start over.', 'error');
    return;
  }

  const existingAadhaar = DB.getActiveByAadhaar(aadhaarLast4);
  if (existingAadhaar && existingAadhaar.email !== sessionBookingData.email) {
    notify('This Aadhaar number already has an active booking.', 'error');
    return;
  }

  if (!sessionBookingData.name) {
    notify('Please enter your name', 'error');
    return;
  }
  sessionBookingData.service = service;

  const booking = await DB.addBooking({
    email: sessionBookingData.email,
    name: sessionBookingData.name,
    aadhaarLast4: sessionBookingData.aadhaarLast4,
    service: sessionBookingData.service,
    date: sessionBookingData.date
  });

  sessionBookingData.confirmedBooking = booking;
  sessionStorage.setItem('myBooking', JSON.stringify(booking));
  updateHeroDisplay();
  renderBookingStep(3);
}

function selectDate(dateStr, el) {
  document.querySelectorAll('.date-btn').forEach(b => b.classList.remove('selected'));
  el.classList.add('selected');
  sessionBookingData.date = dateStr;
  selectedDate = dateStr;
}

function submitBookingStep3() {
  // Legacy alias — booking is now created in submitBookingStep2
  renderBookingStep(3);
}


// ============================================
// CHECK TOKEN MODAL
// ============================================
function openCheckToken() {
  document.getElementById('checkTokenModal').classList.add('open');
  renderCheckTokenStep(1);
}

function closeCheckToken() {
  document.getElementById('checkTokenModal').classList.remove('open');
}

function renderCheckTokenStep(step) {
  const body = document.getElementById('checkTokenBody');

  if (step === 1) {
    body.innerHTML = `
      <p style="font-size:14px; color:var(--text2); margin-bottom:24px;">${t('check_aadhaar_hint')}</p>
      <div class="form-group">
        <label class="form-label">${t('check_aadhaar_label')}</label>
        <div style="position:relative;">
          <div style="display:flex; align-items:center; gap:0; background:transparent; border:1px solid var(--glass-border); border-radius:10px; overflow:hidden;">
            <span style="padding:13px 14px; font-size:14px; color:var(--text3); letter-spacing:0.1em; font-family:'Space Grotesk',sans-serif; border-right:1px solid var(--glass-border); background:transparent; user-select:none; flex-shrink:0;">xxxx xxxx</span>
            <input type="text" id="checkAadhaar" placeholder="XXXX" maxlength="4" inputmode="numeric"
              style="flex:1; background:transparent; border:none; outline:none; padding:13px 14px; color:var(--text); font-size:14px; font-family:'Space Grotesk',sans-serif; letter-spacing:0.15em; font-weight:600;"
              onkeydown="if(event.key==='Enter')lookupByAadhaar()">
          </div>
        </div>
      </div>
      <button class="btn-primary btn-full" onclick="lookupByAadhaar()">${t('check_btn')}</button>
    `;
  } else if (step === 2) {
    const bookings = DB.getByAadhaar(verifiedAadhaar);
    const ct = DB.currentToken;

    if (bookings.length === 0) {
      body.innerHTML = `
        <div style="text-align:center; padding:32px 0;">
          <div style="font-size:48px; margin-bottom:16px; opacity:0.4;"><i class="fas fa-clipboard-list"></i></div>
          <h3 style="font-size:18px; font-weight:600; margin-bottom:8px;">${t('no_bookings_title')}</h3>
          <p style="font-size:14px; color:var(--text2); margin-bottom:24px;">${t('no_bookings_text')} <strong>${verifiedAadhaar}</strong>.</p>
          <button class="btn-primary" onclick="closeCheckToken(); openBooking();">${t('book_now')}</button>
          <button class="btn-secondary" onclick="renderCheckTokenStep(1)" style="margin-top:8px; justify-content:center;">${t('try_again')}</button>
        </div>
      `;
      return;
    }

    const bookingCards = bookings.map(b => {
      const d = new Date(b.date + 'T00:00:00');
      const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      const displayDate = `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
      const myToken = parseInt(b.token);
      const ahead = b.status === 'approved' ? DB.bookings.filter(x => {
        const t = parseInt(x.token);
        return t > ct && t < myToken && (x.status === 'approved' || x.status === 'pending');
      }).length : null;

      const statusClass = b.status;
      const statusLabel = b.status.charAt(0).toUpperCase() + b.status.slice(1);

      sessionStorage.setItem('myBooking', JSON.stringify(b));
      updateHeroDisplay();

      return `
        <div style="background:var(--glass); border:1px solid var(--glass-border); border-radius:14px; padding:20px; margin-bottom:16px;">
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px;">
            <div>
              <div style="font-size:11px;color:var(--text3);margin-bottom:4px;text-transform:uppercase;letter-spacing:0.08em;">${t('token_num')}</div>
              <div style="font-family:'Space Grotesk',sans-serif;font-size:42px;font-weight:700;color:var(--accent);line-height:1;">${b.token}</div>
            </div>
            <div class="status-pill ${statusClass}">${statusLabel}</div>
          </div>
          <div style="display:grid; gap:8px;">
            <div style="display:flex; justify-content:space-between; font-size:13px;">
              <span style="color:var(--text3);">${t('booking_id_label')}</span>
              <span style="font-weight:600;">${b.bookingId}</span>
            </div>
            <div style="display:flex; justify-content:space-between; font-size:13px;">
              <span style="color:var(--text3);">${t('service_label')}</span>
              <span style="font-weight:600;">${b.service}</span>
            </div>
            <div style="display:flex; justify-content:space-between; font-size:13px;">
              <span style="color:var(--text3);">${t('appt_date')}</span>
              <span style="font-weight:600;">${displayDate}</span>
            </div>
            ${ahead !== null ? `
            <div style="display:flex; justify-content:space-between; font-size:13px;">
              <span style="color:var(--text3);">${t('people_ahead')}</span>
              <span style="font-weight:600;">${ahead}</span>
            </div>
            <div style="display:flex; justify-content:space-between; font-size:13px;">
              <span style="color:var(--text3);">${t('est_wait')}</span>
              <span style="font-weight:600;">${(ahead + 1) * 15} ${t('wait_min')}</span>
            </div>` : ''}
          </div>
          ${b.status === 'approved' || b.status === 'pending' ? `
            <button class="btn-secondary w-full" style="margin-top:16px; justify-content:center; font-size:13px; color:var(--danger);" onclick="cancelBooking('${b.bookingId}')">${t('cancel_booking')}</button>
          ` : ''}
        </div>
      `;
    }).join('');

    body.innerHTML = `
      <p style="font-size:14px; color:var(--text2); margin-bottom:20px;">${bookings.length} ${t('no_bookings_text')} <strong>${verifiedAadhaar}</strong>.</p>
      ${bookingCards}
      <button class="btn-secondary btn-full" style="justify-content:center; margin-top:8px;" onclick="renderCheckTokenStep(1)">${t('check_another')}</button>
    `;
  }
}

function lookupByAadhaar() {
  var aadhaar = document.getElementById('checkAadhaar').value.trim().replace(/\D/g, '');
  if (aadhaar.length !== 4) {
    notify('Please enter the last 4 digits of your Aadhaar', 'error');
    return;
  }
  verifiedAadhaar = aadhaar;
  var body = document.getElementById('checkTokenBody');
  body.setAttribute('aria-busy', 'true');
  body.innerHTML = '<div class="loader-inline"><div class="spinner-ring"></div><div class="loader-msg">Looking up your booking...</div></div>';

  function redirectToPortal(booking) {
    sessionStorage.setItem('myBooking', JSON.stringify(booking));
    var vt = sessionStorage.getItem('vt') || '';
    var r = Math.random().toString(36).slice(2, 8);
    window.location.href = 'aadhaar-portal.html?vt=' + vt + '&r=' + r + '&checkToken=1';
  }

  if (window.__bookingsRef) {
    window.__bookingsRef.where('aadhaarLast4', '==', aadhaar).get().then(function(snap) {
      var bookings = [];
      snap.forEach(function(doc) { bookings.push({ id: doc.id, ...doc.data() }); });
      var active = bookings.filter(function(b) { return b.status === 'pending' || b.status === 'approved'; });
      if (active.length > 0) {
        redirectToPortal(active[0]);
      } else if (bookings.length > 0) {
        body.setAttribute('aria-busy', 'false');
        renderCheckTokenStep(2);
      } else {
        body.setAttribute('aria-busy', 'false');
        renderCheckTokenStep(2);
      }
    }).catch(function() {
      setTimeout(function() {
        renderCheckTokenStep(2);
        body.setAttribute('aria-busy', 'false');
      }, 300);
    });
  } else {
    setTimeout(function() {
      renderCheckTokenStep(2);
      body.setAttribute('aria-busy', 'false');
    }, 300);
  }
}

function cancelBooking(bookingId) {
  if (!confirm('Are you sure you want to cancel this booking?')) return;
  const b = DB.bookings.find(x => x.bookingId === bookingId);
  if (b) {
    b.status = 'cancelled';
    b.updatedAt = new Date().toISOString();
    DB.save();
    if (window.__bookingsRef && b.bookingId) {
      window.__bookingsRef.doc(b.bookingId).update({ status: 'cancelled', updatedAt: b.updatedAt }).catch(e => {
        console.warn('[cancelBooking] Firestore sync failed:', e);
      });
    }
    archiveBooking(b);
    sessionStorage.removeItem('myBooking');
    updateHeroDisplay();
    notify('Booking cancelled.', 'info');
    renderCheckTokenStep(2);
  }
}

// ============================================
// ADMIN — Firestore-driven
// ============================================

// -- State --
let adminBookings = [];
let adminQueueData = null;
let adminActivityLogs = [];
let adminDates = [];
let adminUnsubscribers = [];

function adminLogin() {
  var u = document.getElementById('adminUser').value.trim();
  var p = document.getElementById('adminPass').value.trim();
  var errorEl = document.getElementById('adminLoginError');
  if (errorEl) errorEl.classList.remove('show');
  if (!u || !p) { notify('Enter username and password', 'error'); return; }

  var btn = document.querySelector('#adminLoginModal .btn-primary');
  setBtnLoading(btn, true);
  btn.innerHTML = '<i class="fas fa-spinner fa-spin" style="font-size:14px;"></i> Signing in...';
  if (window.__adminsRef) {
    withTimeout(window.__adminsRef.where('username', '==', u.toLowerCase()).get(), 10000, 'Admin login')
      .then(function(snap) {
        setBtnLoading(btn, false);
        btn.innerHTML = 'Login to Dashboard';
        if (snap.empty) {
          if (errorEl) { errorEl.textContent = 'Invalid credentials'; errorEl.classList.add('show'); }
          return;
        }
        var authed = false;
        snap.forEach(function(doc) { if (doc.data().password === p) authed = true; });
        if (authed) {
          openAdminPanel(u);
        } else {
          if (errorEl) { errorEl.textContent = 'Invalid credentials'; errorEl.classList.add('show'); }
        }
      })
      .catch(function(err) {
        setBtnLoading(btn, false);
        btn.innerHTML = 'Login to Dashboard';
        if (errorEl) { errorEl.textContent = err.message || 'Firestore unavailable. Check connection.'; errorEl.classList.add('show'); }
      });
  } else {
    setBtnLoading(btn, false);
    btn.innerHTML = 'Login to Dashboard';
    if (errorEl) { errorEl.textContent = 'Firestore not initialized'; errorEl.classList.add('show'); }
  }
}

function closeAdminLogin() {
  document.getElementById('adminLoginModal').classList.remove('open');
}

function openAdminPanel(user) {
  closeAdminLogin();
  document.getElementById('adminPanel').classList.add('open');
  startAdminListeners();
  logAdminAction(user, 'Admin login', '--', 'info');
}

function closeAdmin() {
  document.getElementById('adminPanel').classList.remove('open');
  adminUnsubscribers.forEach(u => { if (typeof u === 'function') u(); });
  adminUnsubscribers = [];
}

function switchAdminTab(tab, btn) {
  document.querySelectorAll('.admin-tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
  if (btn) btn.classList.add('active');
  const el = document.getElementById('adminTab' + tab.charAt(0).toUpperCase() + tab.slice(1));
  if (el) el.classList.add('active');
}

// -- Firestore — start real-time listeners --
function startAdminListeners() {
  showKpiLoading();
  renderBookingsTable(true);
  renderActivityLogs(true);
  renderAdminDates(true);
  var db = window.__db;
  if (!db) { showKpiError(); return; }

  var sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
  var sixtyDaysAgoStr = sixtyDaysAgo.toISOString();

  var unsubBookings = window.__bookingsRef.where('createdAt', '>=', sixtyDaysAgoStr).onSnapshot(function(snap) {
    adminBookings = [];
    snap.forEach(function(doc) { adminBookings.push({ id: doc.id, ...doc.data() }); });
    updateKpiCards();
    renderBookingsTable(false);
    renderAdminDates();
  }, function(err) { showKpiError(); console.error('[Admin] Bookings error:', err); renderBookingsTable(false); });
  adminUnsubscribers.push(unsubBookings);

  var unsubQueue = window.__queueRef.onSnapshot(function(snap) {
    snap.forEach(function(doc) { adminQueueData = { id: doc.id, ...doc.data() }; });
    if (adminQueueData) {
      document.getElementById('adminTokenDisplay').textContent = String(adminQueueData.currentToken || 1).padStart(2, '0');
      var sdEl = document.getElementById('adminServingDate');
      if (sdEl && adminQueueData.servingDate && !sdEl._userChanged) {
        sdEl.value = adminQueueData.servingDate;
      }
    }
    updateKpiCards();
  }, function(err) { console.error('[Admin] Queue error:', err); });
  adminUnsubscribers.push(unsubQueue);

  var unsubActivity = window.__activityRef.where('timestamp', '>=', sixtyDaysAgo).orderBy('timestamp', 'desc').limit(100).onSnapshot(function(snap) {
    adminActivityLogs = [];
    snap.forEach(function(doc) { adminActivityLogs.push({ id: doc.id, ...doc.data() }); });
    renderActivityLogs(false);
  }, function(err) { console.error('[Admin] Activity error:', err); renderActivityLogs(false); });
  adminUnsubscribers.push(unsubActivity);

  var unsubDates = window.__bookingsRef.where('__type', '==', 'date_config').onSnapshot(function(snap) {
    adminDates = [];
    snap.forEach(function(doc) { adminDates.push({ id: doc.id, ...doc.data() }); });
    renderAdminDates();
  }, function() {});
  adminUnsubscribers.push(unsubDates);

  // Listen for Last Issued Token from appData/sync (reliable read path)
  if (window.__db) {
    var unsubCounter = window.__db.doc('appData/sync').onSnapshot(function(snap) {
      var val = snap.exists ? (snap.data().lastIssuedToken || '--') : '--';
      var el = document.getElementById('kpiLastIssuedToken');
      if (el) el.textContent = val;
    }, function() {});
    adminUnsubscribers.push(unsubCounter);
  }
}

// -- KPI --
function showKpiLoading() {
  const loading = document.getElementById('adminKpiLoading');
  const grid = document.getElementById('adminKpiGrid');
  const err = document.getElementById('adminKpiError');
  if (loading) loading.style.display = 'grid';
  if (grid) grid.style.display = 'none';
  if (err) err.style.display = 'none';
}

function showKpiError() {
  const loading = document.getElementById('adminKpiLoading');
  const grid = document.getElementById('adminKpiGrid');
  const err = document.getElementById('adminKpiError');
  if (loading) loading.style.display = 'none';
  if (grid) grid.style.display = 'none';
  if (err) err.style.display = 'block';
}

function updateKpiCards() {
  const loading = document.getElementById('adminKpiLoading');
  const grid = document.getElementById('adminKpiGrid');
  const err = document.getElementById('adminKpiError');
  if (loading) loading.style.display = 'none';
  if (err) err.style.display = 'none';

  if (!adminBookings.length) {
    if (grid) grid.style.display = 'grid';
    setKpiVal('kpiTodayBookings', 0);
    setKpiVal('kpiPending', 0);
    setKpiVal('kpiApproved', 0);
    setKpiVal('kpiCompleted', 0);
    setKpiVal('kpiCancelled', 0);
    setKpiVal('kpiCurrentToken', adminQueueData ? String(adminQueueData.currentToken || 1).padStart(2, '0') : '--');
    setKpiVal('kpiLastIssuedToken', '--');
    if (grid) grid.style.display = 'grid';
    return;
  }

  const servingDate = getServingDate();
  var sdSummary = document.getElementById('adminSummaryDate');
  if (sdSummary) sdSummary.textContent = 'Date: ' + servingDate;
  const todayB = adminBookings.filter(b => b.date === servingDate);
  const pending = adminBookings.filter(b => b.status === 'pending').length;
  const approved = adminBookings.filter(b => b.status === 'approved').length;
  const completed = adminBookings.filter(b => b.status === 'completed').length;
  const cancelled = adminBookings.filter(b => b.status === 'cancelled').length;
  const ct = adminQueueData ? String(adminQueueData.currentToken || 1).padStart(2, '0') : '--';

  if (grid) grid.style.display = 'grid';
  setKpiVal('kpiTodayBookings', todayB.length);
  setKpiVal('kpiPending', pending);
  setKpiVal('kpiApproved', approved);
  setKpiVal('kpiCompleted', completed);
  setKpiVal('kpiCancelled', cancelled);
  setKpiVal('kpiCurrentToken', ct);
  // kpiLastIssuedToken is updated by the counter listener in startAdminListeners
}

function setKpiVal(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

// -- Bookings Table --
function renderBookingsTable(loading) {
  var tbody = document.getElementById('bookingsTableBody');
  if (!tbody) return;
  if (loading) {
    tbody.setAttribute('aria-busy', 'true');
    tbody.innerHTML = Array(5).fill('<tr class="skeleton-table-row" aria-hidden="true"><td><div class="skeleton-cell circle"></div></td><td><div class="skeleton-cell"></div></td><td><div class="skeleton-cell"></div></td><td><div class="skeleton-cell"></div></td><td><div class="skeleton-cell"></div></td><td><div class="skeleton-cell"></div></td><td><div class="skeleton-cell"></div></td><td><div class="skeleton-cell"></div></td></tr>').join('');
    return;
  }
  tbody.setAttribute('aria-busy', 'false');
  var q = (document.getElementById('adminSearch')?.value || '').toLowerCase();
  var status = document.getElementById('adminStatusFilter')?.value || '';

  var filtered = adminBookings;
  if (status) filtered = filtered.filter(function(b) { return b.status === status; });
  if (q) filtered = filtered.filter(function(b) {
    return (b.name || '').toLowerCase().includes(q) ||
      (b.email || '').toLowerCase().includes(q) ||
      (b.bookingId || '').toLowerCase().includes(q) ||
      (b.aadhaarLast4 || '').includes(q);
  });

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:32px; color:var(--text3);">No bookings available</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(function(b) {
    var d = b.date ? new Date(b.date + 'T00:00:00') : null;
    var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var displayDate = d ? d.getDate() + ' ' + months[d.getMonth()] : '--';
    var token = b.token || b.tokens || '--';
    var bid = b.bookingId || b.id || '--';
    var name = b.name || b.fullName || '--';
    var email = b.email || b.mobile || '--';
    return '<tr><td><span class="token-badge">' + token + '</span></td><td style="font-size:12px; color:var(--text3);">' + bid + '</td><td style="font-weight:500;">' + name + '</td><td>' + email + '</td><td style="font-size:13px;">' + (b.service || 'Aadhaar Update') + '</td><td style="font-size:13px;">' + displayDate + '</td><td><span class="status-pill ' + (b.status || 'pending') + '">' + (b.status || 'pending').charAt(0).toUpperCase() + (b.status || 'pending').slice(1) + '</span></td><td><div class="action-btns">' + (b.status !== 'completed' && b.status !== 'cancelled' ? '<button class="action-btn success" onclick="updateBookingStatus(\'' + b.id + '\',\'completed\')">Complete</button>' : '') + (b.status === 'pending' ? '<button class="action-btn" onclick="updateBookingStatus(\'' + b.id + '\',\'approved\')">Approve</button>' : '') + (b.status !== 'cancelled' && b.status !== 'completed' ? '<button class="action-btn danger" onclick="updateBookingStatus(\'' + b.id + '\',\'cancelled\')">Cancel</button>' : '') + '</div></td></tr>';
  }).join('');
}

function filterBookings() { renderBookingsTable(); }

function updateBookingStatus(docId, status) {
  if (!window.__bookingsRef || !docId) return;
  window.__bookingsRef.doc(docId).update({ status, updatedAt: serverTS() })
    .then(() => {
      logAdminAction(sessionStorage.getItem('adminUser') || 'Admin', 'Booking ' + status, docId, status === 'completed' ? 'success' : 'info');
      notify('Booking updated to ' + status, 'success');
    })
    .catch(err => { notify('Failed to update: ' + err.message, 'error'); });
}

// -- Queue Control --
function getServingDate() {
  var el = document.getElementById('adminServingDate');
  if (el && el.value) return el.value;
  return (adminQueueData && adminQueueData.servingDate) || new Date().toISOString().split('T')[0];
}

function onServingDateChange(val) {
  var el = document.getElementById('adminServingDate');
  if (el) el._userChanged = true;
  if (!window.__queueRef) return;
  window.__queueRef.get().then(function(snap) {
    var docId = null;
    var data = {};
    snap.forEach(function(doc) { docId = doc.id; data = doc.data(); });
    var payload = { servingDate: val };
    if (data && data.currentToken) payload.currentToken = data.currentToken;
    if (docId) {
      window.__queueRef.doc(docId).update(payload);
    } else {
      window.__queueRef.add(payload);
    }
    notify('Serving date updated to ' + val, 'info');
  });
  updateKpiCards();
}

function startToken() {
  if (!window.__queueRef) return;
  const servingDate = getServingDate();
  window.__bookingsRef.where('date', '==', servingDate).where('status', 'in', ['approved','pending','waiting']).get().then(snap => {
    if (snap.empty) { notify('No bookings for this date to start the queue.', 'error'); return; }
    let minToken = Infinity;
    snap.forEach(doc => { const t = parseInt(doc.data().token); if (t < minToken) minToken = t; });
    if (!isFinite(minToken)) { notify('No valid tokens found.', 'error'); return; }
    window.__queueRef.get().then(qsnap => {
      let docId = null;
      qsnap.forEach(doc => { docId = doc.id; });
      var payload = { currentToken: minToken, servingDate: servingDate };
      if (docId) {
        window.__queueRef.doc(docId).update(payload);
      } else {
        window.__queueRef.add(payload);
      }
    });
    logAdminAction(getAdminUser(), 'Started Queue', String(minToken).padStart(2,'0'), 'success');
    notify('Queue started at Token #' + String(minToken).padStart(2,'0') + ' for ' + servingDate, 'success');
  }).catch(err => { notify('Error starting queue: ' + err.message, 'error'); });
}

function changeToken(delta) {
  if (!window.__queueRef) return;
  window.__queueRef.get().then(snap => {
    let docId = null;
    let ct = 1;
    let sd = null;
    snap.forEach(doc => { docId = doc.id; var d = doc.data(); ct = d.currentToken || 1; sd = d.servingDate; });
    const newToken = Math.max(1, ct + delta);
    var payload = { currentToken: newToken, servingDate: sd || getServingDate() };
    if (docId) {
      window.__queueRef.doc(docId).update(payload);
    } else {
      window.__queueRef.add(payload);
    }
    logAdminAction(getAdminUser(), 'Token changed', String(newToken).padStart(2,'0'), 'info');
    notify('Token updated to ' + String(newToken).padStart(2,'0'), 'info');
  });
}

function markNextComplete() {
  if (!window.__bookingsRef || !adminQueueData) return;
  const ct = adminQueueData.currentToken || 1;
  const tokenStr = String(parseInt(ct));
  const servingDate = adminQueueData.servingDate || getServingDate();
  findBookingByToken(tokenStr, servingDate).then(booking => {
    if (!booking) {
      notify('No active booking for current token', 'info');
      return;
    }
    booking.ref.update({ status: 'completed', updatedAt: serverTS() });
    logAdminAction(getAdminUser(), 'Marked complete', tokenStr, 'success');
    notify('Token ' + tokenStr + ' marked complete', 'success');
  });
}

async function findBookingByToken(tokenStr, dateFilter) {
  var q = window.__bookingsRef.where('token', '==', tokenStr).where('status', 'in', ['approved','pending','waiting']);
  if (dateFilter) q = q.where('date', '==', dateFilter);
  var snap = await q.get();
  if (!snap.empty) return snap.docs[0];
  q = window.__bookingsRef.where('token', '==', tokenStr.padStart(2,'0')).where('status', 'in', ['approved','pending','waiting']);
  if (dateFilter) q = q.where('date', '==', dateFilter);
  snap = await q.get();
  if (!snap.empty) return snap.docs[0];
  return null;
}

function advanceToken() {
  if (!window.__queueRef) return;
  window.__queueRef.get().then(snap => {
    let docId = null;
    let ct = 1;
    let sd = null;
    snap.forEach(doc => { docId = doc.id; var d = doc.data(); ct = d.currentToken || 1; sd = d.servingDate; });
    const newToken = ct + 1;
    var payload = { currentToken: newToken, servingDate: sd || getServingDate() };
    if (docId) {
      window.__queueRef.doc(docId).update(payload);
    } else {
      window.__queueRef.add(payload);
    }
    logAdminAction(getAdminUser(), 'Advanced token', String(newToken).padStart(2,'0'), 'info');
    notify('Advanced to next token', 'info');
  });
}

function skipToken() {
  advanceToken();
  notify('Token skipped', 'info');
}

function getAdminUser() {
  return sessionStorage.getItem('adminUser') || 'Admin';
}

function serverTS() {
  try {
    if (typeof firebase !== 'undefined' && firebase.firestore && firebase.firestore.FieldValue) {
      return firebase.firestore.FieldValue.serverTimestamp();
    }
  } catch(e) {}
  return new Date().toISOString();
}

// -- Activity Logs --
function logAdminAction(admin, action, detail, type) {
  if (!window.__activityRef) return;
  window.__activityRef.add({
    admin: admin || 'Admin',
    action: action || 'Unknown action',
    detail: detail || '',
    type: type || 'info',
    timestamp: serverTS()
  }).catch(() => {});
}

function renderActivityLogs(loading) {
  var list = document.getElementById('activityList');
  var empty = document.getElementById('activityEmpty');
  var loadingEl = document.getElementById('activityLoading');
  if (!list) return;
  if (loading) {
    if (list) list.style.display = 'none';
    if (empty) empty.style.display = 'none';
    if (loadingEl) { loadingEl.style.display = 'flex'; loadingEl.innerHTML = '<div class="spinner-ring" style="width:28px;height:28px;border-width:2px;margin-bottom:8px;"></div><div style="font-size:13px;color:var(--text3);">Loading activity logs...</div>'; }
    return;
  }
  if (!adminActivityLogs.length) {
    if (list) list.style.display = 'none';
    if (empty) empty.style.display = 'block';
    if (loadingEl) loadingEl.style.display = 'none';
    return;
  }
  if (list) list.style.display = 'flex';
  if (empty) empty.style.display = 'none';
  if (loadingEl) loadingEl.style.display = 'none';

  list.innerHTML = adminActivityLogs.map(function(a) {
    var icons = { success: 'fa-check-circle', info: 'fa-info-circle', warning: 'fa-exclamation-triangle', error: 'fa-times-circle' };
    var icon = icons[a.type] || 'fa-info-circle';
    var ts = a.timestamp ? (a.timestamp.toDate ? a.timestamp.toDate().toLocaleString() : new Date(a.timestamp).toLocaleString()) : '--';
    return '<div class="activity-item"><div class="activity-item-icon ' + (a.type || 'info') + '"><i class="fas ' + icon + '"></i></div><div class="activity-item-text"><strong>' + (a.admin || 'Admin') + '</strong> ' + (a.action || '') + (a.detail ? '<span style="color:var(--text3)"> — ' + a.detail + '</span>' : '') + '</div><div class="activity-item-time">' + ts + '</div></div>';
  }).join('');
}

// -- Dates --
function renderAdminDates(loading) {
  const grid = document.getElementById('adminDateGrid');
  if (!grid) return;
  if (loading) {
    grid.setAttribute('aria-busy', 'true');
    grid.innerHTML = Array(8).fill('<div class="date-manage-item" style="opacity:0.5;pointer-events:none;"><div class="skeleton-line" style="height:12px;width:30px;margin:0 auto 6px;"></div><div class="skeleton-line" style="height:24px;width:24px;border-radius:6px;margin:0 auto 6px;"></div><div class="skeleton-line" style="height:10px;width:40px;margin:0 auto 8px;"></div><div class="skeleton-line" style="height:10px;width:50px;margin:0 auto;"></div></div>').join('');
    return;
  }
  grid.setAttribute('aria-busy', 'false');
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  if (!adminDates.length) {
    grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:24px; color:var(--text3);" data-translate="admin_no_dates">No dates configured.</div>';
    return;
  }

  grid.innerHTML = adminDates.map((d, i) => {
    if (!d.date) return '';
    const dt = new Date(d.date + 'T00:00:00');
    return `
      <div class="date-manage-item ${d.enabled !== false ? 'enabled' : ''}" onclick="toggleDate('${d.id}')">
        <div class="date-manage-item-day">${days[dt.getDay()]}</div>
        <div class="date-manage-item-num">${dt.getDate()}</div>
        <div class="date-manage-item-month">${months[dt.getMonth()]}</div>
        <div class="date-manage-item-status">${d.enabled !== false ? '● Enabled' : '○ Disabled'}</div>
      </div>
    `;
  }).join('');
}

function toggleDate(docId) {
  if (!window.__bookingsRef || !docId) return;
  const target = adminDates.find(d => d.id === docId);
  if (!target) return;
  const newVal = target.enabled !== false ? false : true;
  window.__bookingsRef.doc(docId).update({ enabled: newVal }).then(() => {
    logAdminAction(sessionStorage.getItem('adminUser') || 'Admin', 'Date ' + (newVal ? 'enabled' : 'disabled'), target.date || docId, 'info');
    notify('Date ' + (newVal ? 'enabled' : 'disabled'), 'info');
  }).catch(err => { notify('Failed: ' + err.message, 'error'); });
}

// Close modals on backdrop click
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', function(e) {
    if (e.target === this) {
      this.classList.remove('open');
    }
  });
});

// Keyboard ESC to close modals
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
  }
});

// Stealth admin access: Ctrl+Shift+A opens admin portal
document.addEventListener('keydown', function(e) {
  if (e.ctrlKey && e.shiftKey && (e.key === 'A' || e.key === 'a')) {
    e.preventDefault();
    window.open('https://indiamobile-admin.vercel.app/', '_blank');
  }
});

// Hidden logo click sequence: 5 rapid clicks opens admin
let logoClickCount = 0;
let logoTimer = null;
document.addEventListener('click', function(e) {
  const logo = e.target.closest('.logo-text, .nav-logo');
  if (logo) {
    logoClickCount++;
    if (logoTimer) clearTimeout(logoTimer);
    logoTimer = setTimeout(() => { logoClickCount = 0; }, 1500);
    if (logoClickCount >= 5) {
      logoClickCount = 0;
      window.open('https://indiamobile-admin.vercel.app/', '_blank');
    }
  }
});

// ============================================
// CONTACT FORM
// ============================================
function submitContactForm() {
  var name = document.getElementById('contactName').value.trim();
  var phone = document.getElementById('contactPhone').value.trim();
  var msg = document.getElementById('contactMessage').value.trim();
  if (!name || !phone || !msg) {
    notify('Please fill in all required fields', 'error');
    return;
  }
  var btn = document.querySelector('#contact .btn-primary');
  setBtnLoading(btn, true);
  btn.innerHTML = '<i class="fas fa-spinner fa-spin" style="font-size:14px;"></i> Sending...';
  var p = window.__activityRef ? window.__activityRef.add({
    type: 'contact', name: name, phone: phone, msg: msg, timestamp: serverTS()
  }) : Promise.resolve();
  withTimeout(p, 10000, 'Contact form')
    .then(function() {
      setBtnLoading(btn, false);
      btn.innerHTML = 'Send Message';
      notify('Message sent! We will get back to you soon.', 'success');
      document.getElementById('contactName').value = '';
      document.getElementById('contactPhone').value = '';
      document.getElementById('contactEmail').value = '';
      document.getElementById('contactMessage').value = '';
    })
    .catch(function(err) {
      setBtnLoading(btn, false);
      btn.innerHTML = 'Send Message';
      notify(err.message || 'Failed to send message. Please try again.', 'error');
    });
}

updateHeroDisplay();

// ============================================
// BILINGUAL LANGUAGE SYSTEM (HINDI / ENGLISH)
// ============================================
const translations = {
  hi: {
    nav_services: "सर्विस",
    nav_about: "हमारे बारे में",
    nav_location: "लोकेशन",
    nav_contact: "कॉन्टैक्ट",
    btn_check_token: "टोकन चेक करें",
    btn_live_token: "लाइव टोकन",
    check_token_sub: "अपनी बुकिंग स्टेटस, कतार पोजीशन और वेटिंग टाइम देखें।",
    services_tag: "सर्विस",
    services_title: "हम आपकी क्या मदद कर सकते हैं?",
    services_subtitle: "हम कई सरकारी और डिजिटल सर्विस देते हैं। बुकिंग शुरू करने के लिए नीचे सर्विस चुनें।",
    services_select_lbl: "बुक करने के लिए सर्विस चुनें",
    select_service_placeholder: "सर्विस चुनें",
    service_choose: "-- सर्विस चुनें --",
    service_aadhaar: "आधार अपडेट",
    service_pan: "पैन सर्विस (जल्द आ रहा है)",
    service_passport: "पासपोर्ट सर्विस (जल्द आ रहा है)",
    service_online: "ऑनलाइन अप्लाई (जल्द आ रहा है)",
    service_ticket: "टिकट बुकिंग (जल्द आ रहा है)",
    coming_soon_note: "यह सर्विस जल्द आ रही है। कृपया बाद में देखें या हमसे कॉन्टैक्ट करें।",
    about_tag: "स्थापना 2018",
    about_title: "आपका भरोसेमंद डिजिटल सर्विस पार्टनर",
    about_subtitle: "इंडिया मोबाइल सेंटर सरकारी सर्विस को सरल और आसान बनाने के लिए बना है। चाहे आधार अपडेट हो, डॉक्यूमेंट अप्लाई करना हो या फॉर्म भरना हो, हम आपकी हर कदम पर मदद करते हैं।",
    about_desc: "हम जानते हैं कि सरकारी प्रोसेस थोड़ा मुश्किल लग सकता है। हमारा ट्रेंड स्टाफ हर स्टेप पर आपको गाइड करता है, हर बार एक आसान और सफल एक्सपीरियंस देता है।",
    highlight_years: "सर्विस के वर्ष",
    highlight_customers: "खुश ग्राहक",
    highlight_success: "सफलता दर",
    highlight_fast: "तेज़ प्रोसेसिंग",
    why_tag: "हमें क्यों चुनें?",
    why_title: "आपकी सुविधा के लिए बनाया गया",
    why_subtitle: "हमारी पूरी कोशिश है कि आपका अनुभव आसान, तेज़ और तनाव-मुक्त हो।",
    feat1_title: "तेज़ सर्विस",
    feat1_desc: "हम टोकन-बेस्ड कतार सिस्टम से वेटिंग टाइम कम रखते हैं। ऑनलाइन बुक करें और समय पर आएं — कोई फालतू इंतज़ार नहीं।",
    feat2_title: "सिक्योर प्रोसेस",
    feat2_desc: "आपकी जानकारी पूरी तरह कॉन्फिडेंशियल रखी जाती है। हम सभी सरकारी सिक्योरिटी गाइडलाइन फॉलो करते हैं।",
    feat3_title: "डिजिटल बुकिंग",
    feat3_desc: "कभी भी, अपने फोन से अपॉइंटमेंट बुक करें। OTP वेरिफिकेशन से आपकी बुकिंग प्रोटेक्ट रहती है।",
    feat4_title: "कतार ट्रैकिंग",
    feat4_desc: "रियल टाइम में अपने टोकन की पोजीशन और लाइव कतार देखें। आपको हमेशा पता रहेगा कि आपकी बारी कब आ रही है।",
    feat5_title: "भरोसेमंद सपोर्ट",
    feat5_desc: "हमारा एक्सपीरियंस्ड स्टाफ हर स्टेप पर आपकी मदद के लिए तैयार है। हम आपकी भाषा समझते हैं और आपकी ज़रूरतों को जानते हैं।",
    feat6_title: "प्रोफेशनल मदद",
    feat6_desc: "फॉर्म भरने से लेकर डॉक्यूमेंट वेरिफिकेशन तक, हम पक्का करते हैं कि आपका अप्लीकेशन पहली बार में ही सही और पूरा हो।",
    stats_tag: "आंकड़े",
    stats_title: "हमारा ट्रैक रिकॉर्ड",
    stat_served: "ग्राहक सेवा",
    stat_completed: "आधार अपडेट पूरे",
    stat_years: "अनुभव के वर्ष",
    stat_satisfaction: "ग्राहक संतुष्टि %",
    reviews_tag: "ग्राहक रिव्यू",
    reviews_title: "हमारे ग्राहक क्या कहते हैं",
    team_tag: "हमारी टीम",
    team_title: "हमारे भरोसेमंद स्टाफ से मिलें",
    team_subtitle: "एक्सपीरियंस्ड प्रोफेशनल जो देखभाल और दक्षता के साथ आपकी सर्विस के लिए समर्पित हैं।",
    team_role_dev: "वेब डेवलपर",
    team_exp_dev: "5+ साल का अनुभव",
    team_desc_dev: "इंडिया मोबाइल डिजिटल प्लेटफॉर्म बनाते और मेंटेन करते हैं। क्लीन कोड और मॉडर्न डिज़ाइन से बेहतरीन यूज़र एक्सपीरियंस देने के शौकीन।",
    team_up_mukhiya: "(यूपी मुखिया)",
    team_role_founder: "मालिक और फाउंडर",
    team_exp_founder: "12+ साल का अनुभव",
    team_desc_founder: "सरकारी सर्विस को आसान बनाने के विज़न से इंडिया मोबाइल सेंटर की शुरुआत की। डिजिटल सर्विस और कम्युनिटी सपोर्ट में एक दशक से ज़्यादा का अनुभव।",
    team_role_support: "कस्टमर सपोर्ट हेड",
    team_exp_support: "6+ साल का अनुभव",
    team_desc_support: "कस्टमर सपोर्ट टीम लीड करते हैं और पक्का करते हैं कि हर विज़िटर को बुकिंग से लेकर सर्विस पूरी होने तक जल्दी मदद मिले।",
    team_role_biometric: "बायोमेट्रिक ऑपरेटर",
    team_exp_biometric: "4+ साल का अनुभव",
    team_desc_biometric: "सर्टिफाइड बायोमेट्रिक ऑपरेटर जो आधार एनरोलमेंट और अपडेट करते हैं। हर ग्राहक के साथ सब्र और अच्छी सर्विस के लिए जाने जाते हैं।",
    find_us_tag: "हमें खोजें",
    find_us_title: "हमारी लोकेशन",
    addr_lbl: "पता",
    phone_lbl: "फोन",
    whatsapp_lbl: "व्हाट्सएप",
    addr_val: "दुकान नंबर 12, मेन मार्केट रोड",
    addr_sub: "पटना, बिहार — 800001",
    call_hours: "वर्किंग आवर्स में कॉल करें",
    msg_anytime: "हमें कभी भी मैसेज करें",
    hours_lbl: "काम के घंटे",
    hours_val: "सोमवार – शनिवार",
    hours_sub: "सुबह 9:00 – शाम 5:00 बजे",
    email_lbl: "ईमेल",
    email_sub: "हम 24 घंटे में जवाब देते हैं",
    contact_tag: "कॉन्टैक्ट",
    contact_title: "हमसे संपर्क करें",
    contact_desc: "हमारी सर्विस के बारे में कोई सवाल? बुकिंग में मदद चाहिए? हम आपकी मदद के लिए यहां हैं। संपर्क करें, हम जल्दी जवाब देंगे।",
    faq1_q: "आधार अपडेट में कितना टाइम लगता है?",
    faq1_a: "हमारे सेंटर पर बायोमेट्रिक वेरिफिकेशन के बाद, आधार अपडेट आमतौर पर 30 से 90 दिनों में UIDAI द्वारा अपडेट हो जाता है। हम पूरी प्रोसेस में आपकी मदद करेंगे और एक रसीद देंगे।",
    faq2_q: "मुझे कौन से डॉक्यूमेंट लाने होंगे?",
    faq2_a: "ज़रूरतें अपडेट के टाइप पर निर्भर करती हैं। पते के अपडेट के लिए, पते का सबूत (बिजली का बिल, किराया समझौता) लाएं। नाम सुधार के लिए, सही नाम का कोई कानूनी डॉक्यूमेंट लाएं। पूरी लिस्ट के लिए हमसे संपर्क करें।",
    faq3_q: "क्या मैं किसी और के लिए बुक कर सकता हूं?",
    faq3_a: "हां। आप अपने परिवार के किसी सदस्य के लिए टोकन बुक कर सकते हैं। बुकिंग में उनके आधार के आखिरी 4 अंक डालें। ध्यान दें कि व्यक्ति को खुद आना होगा क्योंकि बायोमेट्रिक ज़रूरी है।",
    faq4_q: "सर्विस का क्या चार्ज है?",
    faq4_a: "UIDAI के हिसाब से सरकारी फीस लगती है। हमारी सर्विस चार्ज बहुत कम है। अपनी सर्विस के लिए करंट फीस जानने के लिए हमसे सीधे संपर्क करें।",
    contact_form_title: "हमें मैसेज भेजें",
    form_name: "आपका नाम",
    form_name_placeholder: "अपना पूरा नाम लिखें",
    form_phone: "मोबाइल नंबर",
    form_phone_placeholder: "+91 XXXXX XXXXX",
    form_email: "ईमेल (ज़रूरी नहीं)",
    form_email_placeholder: "your@email.com",
    form_message: "मैसेज",
    form_message_placeholder: "अपना सवाल या ज़रूरत बताएं...",
    form_send: "मैसेज भेजें",
    guidelines_header: "डॉक्यूमेंट गाइडलाइन",
    guide_aadhaar_title: "आधार अपडेट",
    guide_aadhaar_text: "असली आधार कार्ड + सेल्फ-अटेस्टेड कॉपी|वैलिड फोटो आईडी (वोटर आईडी / ड्राइविंग लाइसेंस / पासपोर्ट)|2 हालिया पासपोर्ट साइज़ फोटो|बदलाव के लिए सपोर्टिंग डॉक्यूमेंट (शादी का सर्टिफिकेट, पता प्रूफ, वगैरह)",
    guide_pan_title: "पैन सर्विस",
    guide_pan_text: "आधार कार्ड|पुराना पैन कार्ड (दोबारा जारी/सुधार के लिए)|पते का प्रमाण (बिजली बिल / बैंक स्टेटमेंट / किराया समझौता)|2 पासपोर्ट साइज़ फोटो|सेल्फ-डिक्लेरेशन फॉर्म",
    guide_passport_title: "पासपोर्ट सर्विस",
    guide_passport_text: "आधार कार्ड|पते का प्रमाण (बिजली बिल / आधार / बैंक स्टेटमेंट)|जन्म सर्टिफिकेट या 10वीं की मार्कशीट|10 पासपोर्ट साइज़ फोटो|भरे हुए अनुलग्नक फॉर्म (Annexure A / E / F जो लागू हो)",
    guide_online_title: "ऑनलाइन अप्लीकेशन",
    guide_online_text: "आधार कार्ड|पैन कार्ड|हालिया पासपोर्ट साइज़ फोटो|आय और जाति सर्टिफिकेट (अगर ज़रूरी हो)|PDF/JPEG में डॉक्यूमेंट की स्कैन कॉपी|OTP वेरिफिकेशन के लिए मोबाइल नंबर",
    guide_ticket_title: "टिकट बुकिंग",
    guide_ticket_text: "सरकारी फोटो आईडी (आधार / वोटर आईडी / ड्राइविंग लाइसेंस / पासपोर्ट)|कन्फर्मेशन के लिए मोबाइल नंबर|पेमेंट (कैश / UPI / कार्ड)",
    guide_tips_title: "आम सुझाव",
    guide_tips_text: "असली डॉक्यूमेंट + हर एक की कम से कम 2 सेल्फ-अटेस्टेड कॉपी लेकर आएं|फोटो सफेद बैकग्राउंड पर, हालिया (6 महीने अंदर) हो|15 मिनट पहले पहुंचें|सुधार के लिए सपोर्टिंग सर्टिफिकेट लाएं",
    footer_desc: "आधार और डिजिटल सरकारी सर्विस के लिए आपका भरोसेमंद पार्टनर। सबके लिए तेज़, सिक्योर और प्रोफेशनल मदद।",
    footer_quicklinks: "त्वरित लिंक",
    footer_home: "होम",
    footer_services: "सर्विस",
    footer_about: "हमारे बारे में",
    footer_live_token: "लाइव टोकन",
    footer_location: "लोकेशन",
    footer_contact: "कॉन्टैक्ट",
    footer_serv_title: "सर्विस",
    footer_mobile_link: "मोबाइल लिंक",
    footer_addr_update: "पता अपडेट",
    footer_bio_update: "बायोमेट्रिक अपडेट",
    footer_name_corr: "नाम सुधार",
    footer_contact_title: "कॉन्टैक्ट",
    footer_whatsapp: "व्हाट्सएप करें",
    footer_hours: "सोम–शनि, सुबह 9–शाम 5",
    footer_copyright: "© 2025 इंडिया मोबाइल सेंटर। सभी अधिकार सुरक्षित।",
    footer_auth: "अधिकृत आधार सेवा प्रदाता",
    booking_modal_title: "आधार टोकन बुक करें",
    book_title: "अपना टोकन बुक करें",
    choose_date_title: "तारीख चुनें",
    confirmed_title: "बुकिंग कन्फर्म",
    check_modal_title: "टोकन चेक करें",
    admin_modal_title: "एडमिन लॉगिन",
    admin_user_label: "यूज़रनेम",
    admin_user_placeholder: "यूज़रनेम",
    admin_pass_label: "पासवर्ड",
    admin_pass_placeholder: "••••••••",
    admin_login_btn: "डैशबोर्ड में लॉगिन करें",
    admin_nav_title: "इंडिया मोबाइल एडमिन",
    admin_dashboard_label: "डैशबोर्ड",
    admin_exit_btn: "डैशबोर्ड से बाहर निकलें",
    admin_total_bookings: "कुल बुकिंग",
    admin_pending: "पेंडिंग",
    admin_approved: "अप्रूव्ड",
    admin_completed: "कम्पलीट",
    admin_tab_bookings: "बुकिंग",
    admin_tab_queue: "कतार कंट्रोल",
    admin_tab_dates: "डेट मैनेज करें",
    admin_tab_activity: "एक्टिविटी लॉग",
    admin_no_bookings: "कोई बुकिंग नहीं है",
    admin_no_dates: "कोई डेट कॉन्फ़िगर नहीं है",
    admin_firestore_error: "डैशबोर्ड डेटा लोड करने में विफल। फायरस्टोर कनेक्शन जांचें।",
    kpi_today_bookings: "आज की बुकिंग",
    kpi_pending: "पेंडिंग टोकन",
    kpi_approved: "प्रोसेसिंग टोकन",
    kpi_completed: "कम्पलीट टोकन",
    kpi_cancelled: "कैंसिल टोकन",
    kpi_current_token: "चालू टोकन",
    kpi_last_issued_token: "अंतिम जारी टोकन",
    admin_search_placeholder: "नाम, फोन, बुकिंग आईडी, आधार से सर्च...",
    admin_filter_all: "सभी स्टेटस",
    admin_filter_pending: "पेंडिंग",
    admin_filter_approved: "अप्रूव्ड",
    admin_filter_completed: "कम्पलीट",
    admin_filter_cancelled: "कैंसिल",
    admin_th_token: "टोकन",
    admin_th_booking_id: "बुकिंग आईडी",
    admin_th_name: "नाम",
    admin_th_mobile: "मोबाइल",
    admin_th_service: "सर्विस",
    admin_th_date: "तारीख",
    admin_th_status: "स्टेटस",
    admin_th_actions: "कार्रवाई",
    admin_serving_token: "अभी जिसकी बारी है",
    admin_serving_desc: "लाइव कतार अपडेट करने के लिए बदलें",
    admin_serving_date_label: "सर्विस की तारीख",
    admin_today_summary: "सर्विस तारीख का सारांश",
    admin_tokens_issued: "टोकन जारी हुए",
    admin_in_queue: "कतार में",
    admin_completed_today: "आज पूरे हुए",
    admin_quick_actions: "त्वरित कार्रवाई",
    admin_mark_complete: "अभी के टोकन को पूरा करें",
    admin_advance_token: "अगले टोकन पर जाएं",
    admin_skip_token: "अभी का टोकन छोड़ें",
    admin_enable_dates: "बुकिंग डेट ऑन करें",
    admin_enable_dates_desc: "ग्राहक बुकिंग के लिए डेट को ऑन या ऑफ करने के लिए क्लिक करें। सिर्फ ऑन डेट ही बुकिंग फॉर्म में दिखेगी।",
    // Booking modal dynamic keys
    select_service: "सर्विस चुनें",
    booking_service_choose: "-- सर्विस चुनें --",
    mobile_update: "मोबाइल नंबर अपडेट",
    addr_update: "पता अपडेट",
    name_correction: "नाम सुधार",
    dob_update: "जन्म तिथि अपडेट",
    bio_update: "बायोमेट्रिक अपडेट",
    other_aadhaar: "अन्य आधार सर्विस",
    email_label: "ईमेल एड्रेस",
    email_plc: "your@email.com",
    aadhaar_label: "आधार नंबर",
    aadhaar_hint: "सिर्फ अपने आधार के आखिरी 4 अंक डालें",
    otp_hint: "आपके ईमेल पर भेजा गया 6-अंकों का OTP डालें",
    verify_otp_btn: "OTP वेरिफाई करें और आगे बढ़ें",
    resend_otp: "OTP दोबारा भेजें",
    send_otp_btn: "OTP भेजें",
    no_dates: "अभी कोई डेट उपलब्ध नहीं है। कृपया हमसे सीधे संपर्क करें।",
    select_date_hint: "अपनी पसंदीदा अपॉइंटमेंट डेट चुनें। सिर्फ उपलब्ध डेट दिखाई गई हैं।",
    back_btn: "वापस जाएं",
    confirm_booking: "बुकिंग कन्फर्म करें",
    booking_confirmed: "बुकिंग कन्फर्म हो गई",
    booking_success: "आपका आधार अपॉइंटमेंट सफलतापूर्वक बुक हो गया है।",
    your_token_label: "आपका टोकन नंबर",
    booking_id_label: "बुकिंग आईडी",
    service_label: "सर्विस",
    aadhaar_detail: "आधार",
    appt_date: "अपॉइंटमेंट डेट",
    status_label: "स्टेटस",
    approved: "अप्रूव्ड",
    instructions_title: "महत्वपूर्ण निर्देश",
    instructions_body: '<div style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);border-radius:10px;padding:14px 16px;margin-bottom:12px;font-size:13px;font-weight:700;color:#fc8181;text-align:left;">महत्वपूर्ण: टोकन बुकिंग/प्रबंधन शुल्क ₹5 केंद्र पर भुगतान करना अनिवार्य है। कृपया संभव हो तो सही राशि साथ लेकर आएं।</div><ol style="margin:0;padding-left:20px;font-size:13px;color:var(--text2);line-height:1.8;"><li>कृपया निर्धारित समय से कम से कम 15 मिनट पहले केंद्र पर पहुंचें।</li><li>अपना मूल आधार कार्ड तथा आवश्यक दस्तावेज साथ लेकर आएं।</li><li>यात्रा के समय अपना बुकिंग आईडी और टोकन नंबर उपलब्ध रखें।</li><li>अधूरे या गलत दस्तावेज होने पर सेवा में देरी या अस्वीकृति हो सकती है।</li><li>विशेष परिस्थितियों में केंद्र टोकन क्रम में परिवर्तन कर सकता है।</li><li>केंद्र कर्मचारियों द्वारा दिए गए निर्देशों का पालन करें।</li><li>आवश्यक दस्तावेजों के बिना यह बुकिंग सेवा की गारंटी नहीं देती है।</li><li>केंद्र आने से पहले लाइव कतार की स्थिति अवश्य जांच लें।</li><li>सत्यापन हेतु इस पुष्टि पृष्ठ या डाउनलोड की गई पीडीएफ को सुरक्षित रखें।</li></ol>',
    done_btn: "हो गया",
    print_btn: "प्रिंट करें",
    // Check token modal keys
    check_aadhaar_hint: "बुकिंग के समय इस्तेमाल किए गए आधार नंबर के आखिरी 4 अंक डालें।",
    check_aadhaar_label: "आधार नंबर (आखिरी 4 अंक)",
    check_btn: "टोकन चेक करें",
    no_bookings_title: "कोई बुकिंग नहीं मिली",
    no_bookings_text: "इस आधार से कोई बुकिंग नहीं मिली।",
    book_now: "अभी टोकन बुक करें",
    try_again: "फिर से कोशिश करें",
    token_num: "टोकन नंबर",
    people_ahead: "आपसे आगे लोग",
    est_wait: "अनुमानित इंतज़ार",
    wait_min: "मिनट",
    cancel_booking: "बुकिंग कैंसिल करें",
    check_another: "दूसरा चेक करें"
  },
  en: {
    nav_services: "Services",
    nav_about: "About",
    nav_location: "Location",
    nav_contact: "Contact",
    btn_check_token: "Check My Token",
    btn_live_token: "Live Token",
    check_token_sub: "View your booking status, queue position & estimated wait time",
    services_tag: "Services",
    services_title: "What Can We Help You With?",
    services_subtitle: "We provide a range of government and digital services. Select a service below to get started with your booking.",
    services_select_lbl: "Select a Service to Book",
    select_service_placeholder: "Choose a Service",
    service_choose: "-- Choose a Service --",
    service_aadhaar: "Aadhaar Update",
    service_pan: "PAN Services (Coming Soon)",
    service_passport: "Passport Services (Coming Soon)",
    service_online: "Online Applications (Coming Soon)",
    service_ticket: "Ticket Booking (Coming Soon)",
    coming_soon_note: "This service is coming soon. Please check back later or contact us for assistance.",
    about_tag: "Established 2018",
    about_title: "Your Trusted Digital Service Partner",
    about_subtitle: "India Mobile Center was built to make government services simple and accessible for everyone. Whether you need to update your Aadhaar, apply for documents, or get help with digital forms, we are here to assist you with care and professionalism.",
    about_desc: "We understand that government processes can feel overwhelming. Our trained staff guides you through every step, ensuring a smooth and successful experience every time.",
    highlight_years: "Years of Service",
    highlight_customers: "Happy Customers",
    highlight_success: "Success Rate",
    highlight_fast: "Fast Processing",
    why_tag: "Why Choose Us",
    why_title: "Built for Your Convenience",
    why_subtitle: "Everything we do is designed to make your visit easy, fast, and stress-free.",
    feat1_title: "Fast Service",
    feat1_desc: "We keep wait times short with our token-based queue system. Book online and arrive on time — no unnecessary waiting.",
    feat2_title: "Secure Process",
    feat2_desc: "Your personal information is handled with strict confidentiality. We follow all government security guidelines.",
    feat3_title: "Digital Booking",
    feat3_desc: "Book your appointment from your phone, anytime. OTP verification ensures your booking is protected.",
    feat4_title: "Queue Tracking",
    feat4_desc: "Check your token status and live queue position in real time. You will always know when your turn is coming.",
    feat5_title: "Trusted Support",
    feat5_desc: "Our experienced staff is ready to assist you at every step. We speak your language and understand your needs.",
    feat6_title: "Professional Assistance",
    feat6_desc: "From form filling to document verification, we ensure your application is complete and accurate the first time.",
    stats_tag: "By the Numbers",
    stats_title: "Our Track Record",
    stat_served: "Customers Served",
    stat_completed: "Aadhaar Updates Completed",
    stat_years: "Years of Experience",
    stat_satisfaction: "Customer Satisfaction %",
    reviews_tag: "Customer Reviews",
    reviews_title: "What Our Customers Say",
    team_tag: "Our Team",
    team_title: "Meet Our Trusted Staff",
    team_subtitle: "Experienced professionals dedicated to serving you with care and efficiency.",
    team_role_dev: "Web Developer",
    team_exp_dev: "5+ years experience",
    team_desc_dev: "Built and maintains the India Mobile digital platform. Passionate about creating seamless user experiences through clean code and modern design.",
    team_up_mukhiya: "(UP Mukhiya)",
    team_role_founder: "Owner & Founder",
    team_exp_founder: "12+ years experience",
    team_desc_founder: "Founded India Mobile Center with a vision to make government services accessible. Over a decade of experience in digital service delivery and community support.",
    team_role_support: "Customer Support Lead",
    team_exp_support: "6+ years experience",
    team_desc_support: "Leads the customer support team ensuring every visitor gets prompt assistance and a smooth experience from booking to service completion.",
    team_role_biometric: "Biometric Operator",
    team_exp_biometric: "4+ years experience",
    team_desc_biometric: "Certified biometric operator handling Aadhaar enrollments and updates. Known for patient and thorough service with every customer.",
    find_us_tag: "Find Us",
    find_us_title: "Our Location",
    addr_lbl: "Address",
    phone_lbl: "Phone",
    whatsapp_lbl: "WhatsApp",
    addr_val: "Shop No. 12, Main Market Road",
    addr_sub: "Patna, Bihar — 800001",
    call_hours: "Call us during working hours",
    msg_anytime: "Message us anytime",
    hours_lbl: "Working Hours",
    hours_val: "Monday – Saturday",
    hours_sub: "9:00 AM – 5:00 PM",
    email_lbl: "Email",
    email_sub: "We reply within 24 hours",
    contact_tag: "Contact Us",
    contact_title: "Get in Touch",
    contact_desc: "Have a question about our services? Need help with your booking? We are here to assist you. Reach out and we will respond quickly.",
    faq1_q: "How long does Aadhaar update take?",
    faq1_a: "After successful biometric verification at our center, Aadhaar updates are typically reflected within 30 to 90 days by UIDAI. We will guide you through the process and give you the acknowledgement slip.",
    faq2_q: "What documents do I need to bring?",
    faq2_a: "Requirements vary by the type of update. For address update, bring proof of address (electricity bill, rent agreement, etc.). For name correction, bring a legal document with the correct name. Contact us for a complete list specific to your service.",
    faq3_q: "Can I book for someone else?",
    faq3_a: "Yes. You can book a token for a family member. Just use their Aadhaar last 4 digits during booking. Please ensure the person physically attends the appointment as biometrics are required.",
    faq4_q: "What is the service fee?",
    faq4_a: "Government-prescribed fees apply as set by UIDAI. Our service assistance charge is nominal. Please contact us directly for the current fee structure for your specific service type.",
    contact_form_title: "Send Us a Message",
    form_name: "Your Name",
    form_name_placeholder: "Enter your full name",
    form_phone: "Mobile Number",
    form_phone_placeholder: "+91 XXXXX XXXXX",
    form_email: "Email (Optional)",
    form_email_placeholder: "your@email.com",
    form_message: "Message",
    form_message_placeholder: "Describe your query or requirement...",
    form_send: "Send Message",
    guidelines_header: "Document Guidelines",
    guide_aadhaar_title: "Aadhaar Update",
    guide_aadhaar_text: "Original Aadhaar card + self-attested copy|Valid photo ID (Voter ID / Driving License / Passport)|2 recent passport-size photographs|Supporting document for change (marriage certificate, address proof, etc.) if applicable",
    guide_pan_title: "PAN Services",
    guide_pan_text: "Aadhaar card|Existing PAN card (for re-issue/correction)|Proof of address (utility bill / bank statement / rent agreement)|2 passport-size photos|Self-declaration form",
    guide_passport_title: "Passport Services",
    guide_passport_text: "Aadhaar card|Proof of address (utility bill / Aadhaar / bank statement)|Birth certificate or class 10 mark sheet|10 passport-size photos|Filled annexure forms (Annexure A / E / F as applicable)",
    guide_online_title: "Online Applications",
    guide_online_text: "Aadhaar card|PAN card|Recent passport-size photo|Income certificate & caste certificate (if required)|Scanned copies of documents in PDF/JPEG format|Valid mobile number for OTP verification",
    guide_ticket_title: "Ticket Booking",
    guide_ticket_text: "Valid government-issued photo ID (Aadhaar / Voter ID / Driving License / Passport)|Mobile number for confirmation|Payment method (cash / UPI / card)",
    guide_tips_title: "General Tips",
    guide_tips_text: "Carry original documents + at least 2 self-attested copies of each|Photos should be white background, recent (within 6 months)|Reach 15 minutes early|For any correction/change, bring relevant supporting certificate",
    footer_desc: "Your trusted partner for Aadhaar and digital government services. Fast, secure, and professional assistance for everyone.",
    footer_quicklinks: "Quick Links",
    footer_home: "Home",
    footer_services: "Services",
    footer_about: "About Us",
    footer_live_token: "Live Token",
    footer_location: "Location",
    footer_contact: "Contact",
    footer_serv_title: "Services",
    footer_mobile_link: "Mobile Link",
    footer_addr_update: "Address Update",
    footer_bio_update: "Biometric Update",
    footer_name_corr: "Name Correction",
    footer_contact_title: "Contact",
    footer_whatsapp: "WhatsApp Us",
    footer_hours: "Mon–Sat, 9AM–5PM",
    footer_copyright: "© 2025 India Mobile Center. All rights reserved.",
    footer_auth: "Authorized Aadhaar Service Provider",
    booking_modal_title: "Book Aadhaar Token",
    check_modal_title: "Check My Token",
    admin_modal_title: "Admin Login",
    admin_user_label: "Username",
    admin_user_placeholder: "Username",
    admin_pass_label: "Password",
    admin_pass_placeholder: "••••••••",
    admin_login_btn: "Login to Dashboard",
    admin_nav_title: "India Mobile Admin",
    admin_dashboard_label: "Dashboard",
    admin_exit_btn: "Exit Dashboard",
    admin_total_bookings: "Total Bookings",
    admin_pending: "Pending",
    admin_approved: "Approved",
    admin_completed: "Completed",
    admin_tab_bookings: "Bookings",
    admin_tab_queue: "Queue Control",
    admin_tab_dates: "Manage Dates",
    admin_tab_activity: "Activity Logs",
    admin_no_bookings: "No bookings available",
    admin_no_dates: "No dates configured.",
    admin_firestore_error: "Failed to load dashboard data. Check Firestore connection.",
    kpi_today_bookings: "Today's Bookings",
    kpi_pending: "Pending Tokens",
    kpi_approved: "Processing Tokens",
    kpi_completed: "Completed Tokens",
    kpi_cancelled: "Cancelled Tokens",
    kpi_current_token: "Current Running Token",
    kpi_last_issued_token: "Last Issued Token",
    admin_search_placeholder: "Search by name, phone, booking ID, Aadhaar...",
    admin_filter_all: "All Status",
    admin_filter_pending: "Pending",
    admin_filter_approved: "Approved",
    admin_filter_completed: "Completed",
    admin_filter_cancelled: "Cancelled",
    admin_th_token: "Token",
    admin_th_booking_id: "Booking ID",
    admin_th_name: "Name",
    admin_th_mobile: "Mobile",
    admin_th_service: "Service",
    admin_th_date: "Date",
    admin_th_status: "Status",
    admin_th_actions: "Actions",
    admin_serving_token: "Currently Serving Token",
    admin_serving_desc: "Change to update the live queue display",
    admin_serving_date_label: "Serving Date",
    admin_today_summary: "Serving Date Summary",
    admin_tokens_issued: "Tokens Issued",
    admin_in_queue: "In Queue",
    admin_completed_today: "Completed Today",
    admin_quick_actions: "Quick Actions",
    admin_mark_complete: "Mark Current Token Complete",
    admin_advance_token: "Advance to Next Token",
    admin_skip_token: "Skip Current Token",
    admin_enable_dates: "Enable Booking Dates",
    admin_enable_dates_desc: "Click on a date to enable or disable it for customer bookings. Only enabled dates will appear in the booking form.",
    book_title: "Book Your Token",
    choose_date_title: "Choose Date",
    confirmed_title: "Booking Confirmed",
    select_service: "Select Service",
    booking_service_choose: "-- Choose a Service --",
    mobile_update: "Mobile Number Update",
    addr_update: "Address Update",
    name_correction: "Name Correction",
    dob_update: "Date of Birth Update",
    bio_update: "Biometric Update",
    other_aadhaar: "Other Aadhaar Services",
    email_label: "Email Address",
    email_plc: "your@email.com",
    aadhaar_label: "Aadhaar Number",
    aadhaar_hint: "Enter only the last 4 digits of your Aadhaar",
    otp_hint: "Enter the 6-digit OTP sent to your email",
    verify_otp_btn: "Verify OTP & Continue",
    resend_otp: "Resend OTP",
    send_otp_btn: "Send OTP",
    no_dates: "No dates available at the moment. Please contact us directly.",
    select_date_hint: "Select your preferred appointment date. Only available dates are shown.",
    back_btn: "Back",
    confirm_booking: "Confirm Booking",
    booking_confirmed: "Booking Confirmed",
    booking_success: "Your Aadhaar appointment is booked successfully.",
    your_token_label: "Your Token Number",
    booking_id_label: "Booking ID",
    service_label: "Service",
    aadhaar_detail: "Aadhaar",
    appt_date: "Appointment Date",
    status_label: "Status",
    approved: "Approved",
    instructions_title: "Important Instructions",
    instructions_body: '<div style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);border-radius:10px;padding:14px 16px;margin-bottom:12px;font-size:13px;font-weight:700;color:#fc8181;text-align:left;">IMPORTANT: A booking/token management charge of ₹5 must be paid at the centre during your visit. Please keep the exact amount ready if possible.</div><ol style="margin:0;padding-left:20px;font-size:13px;color:var(--text2);line-height:1.8;"><li>Please arrive at the centre at least 15 minutes before your scheduled time.</li><li>Carry your original Aadhaar Card and all required supporting documents.</li><li>Keep your Booking ID and Token Number available during your visit.</li><li>Incomplete or incorrect documents may result in service delay or rejection.</li><li>The centre reserves the right to change token sequence in exceptional circumstances.</li><li>Follow all instructions provided by the centre staff.</li><li>This booking confirmation does not guarantee service if mandatory documents are missing.</li><li>Please check the live queue status before visiting the centre.</li><li>Keep this confirmation page or downloaded PDF available for verification.</li></ol>',
    done_btn: "Done",
    print_btn: "Print",
    check_aadhaar_hint: "Enter the last 4 digits of the Aadhaar number used at the time of booking.",
    check_aadhaar_label: "Aadhaar Number (Last 4 Digits)",
    check_btn: "Check My Token",
    no_bookings_title: "No Bookings Found",
    no_bookings_text: "We could not find any bookings for this Aadhaar.",
    book_now: "Book a Token Now",
    try_again: "Try Again",
    token_num: "Token Number",
    people_ahead: "People Ahead",
    est_wait: "Est. Wait",
    wait_min: "min",
    cancel_booking: "Cancel Booking",
    check_another: "Check Another"
  }
};

let currentLang = localStorage.getItem('site_lang') || 'hi';

window.t = function(key) {
  return (translations[currentLang] && translations[currentLang][key]) || key;
};

window.setLanguage = function(lang) {
  currentLang = lang;
  localStorage.setItem('site_lang', lang);
  document.documentElement.lang = lang;

  document.querySelectorAll('[data-translate]').forEach(el => {
    const key = el.getAttribute('data-translate');
    if (translations[lang] && translations[lang][key]) {
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        el.placeholder = translations[lang][key];
      } else if (el.tagName === 'UL') {
        const parts = translations[lang][key].split('|');
        const items = el.querySelectorAll('li');
        items.forEach((li, i) => { if (parts[i]) li.textContent = parts[i]; });
      } else {
        el.textContent = translations[lang][key];
      }
    }
  });

  document.querySelectorAll('[data-translate-options] option').forEach(opt => {
    const key = opt.getAttribute('data-translate-opt');
    if (translations[lang] && translations[lang][key]) {
      opt.textContent = translations[lang][key];
    }
  });

  document.querySelectorAll('[data-translate-opt]').forEach(el => {
    const key = el.getAttribute('data-translate-opt');
    if (translations[lang] && translations[lang][key]) {
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        el.placeholder = translations[lang][key];
      } else {
        el.textContent = translations[lang][key];
      }
    }
  });

  // Sync toggle switches
  ['', 'Mobile'].forEach(suffix => {
    const wrapper = document.getElementById('langSwitch' + suffix);
    const hiOpt  = document.getElementById('langOptHi' + suffix);
    const enOpt  = document.getElementById('langOptEn' + suffix);
    if (wrapper) {
      if (lang === 'en') {
        wrapper.classList.add('en');
      } else {
        wrapper.classList.remove('en');
      }
    }
    if (hiOpt && enOpt) {
      hiOpt.classList.toggle('active', lang === 'hi');
      enOpt.classList.toggle('active', lang === 'en');
    }
  });

  // Re-render dynamic content if modals are open
  if (document.getElementById('bookingModal').classList.contains('open')) {
    renderBookingStep(bookingStep);
  }
  if (document.getElementById('checkTokenModal').classList.contains('open')) {
    renderCheckTokenStep(checkTokenStep);
  }
};

window.toggleLanguage = function() {
  const nextLang = currentLang === 'hi' ? 'en' : 'hi';
  window.setLanguage(nextLang);
};

// Apply default language as Hindi
window.setLanguage(currentLang);

// Auto-open Check Token modal if ?checkToken=1 in URL
(function() {
  var params = new URLSearchParams(window.location.search);
  if (params.get('checkToken') === '1') {
    var checkEl = document.getElementById('checkTokenModal');
    if (checkEl && typeof openCheckToken === 'function') {
      openCheckToken();
    } else {
      document.addEventListener('DOMContentLoaded', function() {
        if (typeof openCheckToken === 'function') openCheckToken();
      });
    }
  }
})();
