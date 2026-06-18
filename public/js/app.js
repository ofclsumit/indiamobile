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
      if (this.enabledDates.length === 0) this.initDates();
    } catch(e) { this.initDates(); }
  },

  save() {
    try {
      DBSync.setBookings(this.bookings);
      DBSync.setToken(this.currentToken);
      DBSync.setDates(this.enabledDates);
    } catch(e) {}
  },

  initDates() {
    const dates = [];
    const now = new Date();
    for (let i = 1; i <= 7; i++) {
      const d = new Date(now);
      d.setDate(now.getDate() + i);
      dates.push({ date: d.toISOString().split('T')[0], enabled: true });
    }
    this.enabledDates = dates;
    this.save();
  },

  getEnabledDates() {
    return this.enabledDates.filter(d => d.enabled);
  },

  getNextToken() {
    const max = this.bookings.reduce((m, b) => Math.max(m, parseInt(b.token) || 0), 0);
    return String(max + 1).padStart(2, '0');
  },

  generateBookingId() {
    return 'DS' + Date.now().toString().slice(-6) + Math.floor(Math.random()*100);
  },

  addBooking(data) {
    const token = this.getNextToken();
    const bid = this.generateBookingId();
    const booking = { ...data, token, bookingId: bid, status: 'approved', createdAt: new Date().toISOString() };
    this.bookings.push(booking);
    this.save();
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

function archiveBooking(booking) {
  if (!booking || (booking.status !== 'completed' && booking.status !== 'cancelled')) return;
  const cache = DBSync.getCache();
  if (!cache.find(b => b.bookingId === booking.bookingId)) {
    cache.push({ ...booking, archivedAt: new Date().toISOString() });
    DBSync.setCache(cache);
  }
}

// Listen for remote data changes (admin actions, other tabs)
DBSync.subscribe(function(data) {
  DB.bookings = data.bookings;
  DB.currentToken = data.token;
  updateQueueDisplay();
  updateLiveIndicator();
});

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
// QUEUE DISPLAY
// ============================================
function updateQueueDisplay() {
  const ct = DB.currentToken;
  const heroTokenEl = document.getElementById('heroCurrentToken');
  if (heroTokenEl) heroTokenEl.textContent = String(ct).padStart(2, '0');
  const liveTokenEl = document.getElementById('liveCurrentToken');
  if (liveTokenEl) liveTokenEl.textContent = String(ct).padStart(2, '0');

  const inQueue = DB.bookings.filter(b => b.status === 'approved' || b.status === 'pending').length;
  const heroQueueEl = document.getElementById('heroInQueue');
  if (heroQueueEl) heroQueueEl.textContent = inQueue;

  const myBookingRaw = sessionStorage.getItem('myBooking');
  if (myBookingRaw) {
    try {
      const myB = JSON.parse(myBookingRaw);
      const myToken = parseInt(myB.token);
      document.getElementById('liveYourToken').textContent = String(myToken).padStart(2, '0');
      const ahead = DB.bookings.filter(b => {
        const t = parseInt(b.token);
        return t > ct && t < myToken && (b.status === 'approved' || b.status === 'pending');
      }).length;
      document.getElementById('livePeopleAhead').textContent = ahead;
      document.getElementById('liveWaitTime').textContent = (ahead + 1) * 15 + 'm';
      document.getElementById('liveLoginPrompt').style.display = 'none';
    } catch(e) {}
  }
}

updateQueueDisplay();
setInterval(updateQueueDisplay, 30000);

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
    document.getElementById('bookingModalTitle').textContent = 'Book Your Token';
    body.innerHTML = stepIndicator + `
      <!-- Service Selection -->
      <div class="form-group">
        <label class="form-label">Select Service</label>
        <select class="form-select" id="bookService">
          <option value="">-- Choose a Service --</option>
          <option value="Mobile Number Update" ${savedService === 'Mobile Number Update' ? 'selected' : ''}>Mobile Number Update</option>
          <option value="Address Update" ${savedService === 'Address Update' ? 'selected' : ''}>Address Update</option>
          <option value="Name Correction" ${savedService === 'Name Correction' ? 'selected' : ''}>Name Correction</option>
          <option value="Date of Birth Update" ${savedService === 'Date of Birth Update' ? 'selected' : ''}>Date of Birth Update</option>
          <option value="Biometric Update" ${savedService === 'Biometric Update' ? 'selected' : ''}>Biometric Update</option>
          <option value="Other Aadhaar Services" ${savedService === 'Other Aadhaar Services' ? 'selected' : ''}>Other Aadhaar Services</option>
        </select>
      </div>

      <div style="height:1px; background:var(--glass-border); margin:20px 0;"></div>

      <!-- Email -->
      <div class="form-group">
        <label class="form-label">Email Address</label>
        <input type="email" class="form-input" id="bookEmail" placeholder="your@email.com"
          value="${sessionBookingData.email || ''}"
          style="width:100%;padding:13px 14px;background:rgba(255,255,255,0.03);border:1px solid var(--glass-border);border-radius:10px;color:var(--text);font-size:14px;font-family:inherit;outline:none;transition:border-color 0.2s;"
          onfocus="this.style.borderColor='rgba(59,130,246,0.5)'"
          onblur="this.style.borderColor='var(--glass-border)'">
      </div>

      <!-- Aadhaar Number — last 4 digits -->
      <div class="form-group">
        <label class="form-label">Aadhaar Number</label>
        <div style="position:relative;">
          <div style="display:flex; align-items:center; gap:0; background:rgba(255,255,255,0.03); border:1px solid var(--glass-border); border-radius:10px; overflow:hidden; transition:border-color 0.2s;" id="aadhaarFieldWrap">
            <span style="padding:13px 14px; font-size:14px; color:var(--text3); letter-spacing:0.1em; font-family:'Space Grotesk',sans-serif; border-right:1px solid var(--glass-border); background:rgba(255,255,255,0.02); user-select:none; flex-shrink:0;">xxxx xxxx</span>
            <input type="text" id="bookAadhaarLast4" placeholder="XXXX" maxlength="4" inputmode="numeric"
              value="${sessionBookingData.aadhaarLast4 || ''}"
              style="flex:1; background:transparent; border:none; outline:none; padding:13px 14px; color:var(--text); font-size:14px; font-family:'Space Grotesk',sans-serif; letter-spacing:0.15em; font-weight:600;"
              onfocus="document.getElementById('aadhaarFieldWrap').style.borderColor='rgba(59,130,246,0.5)'"
              onblur="document.getElementById('aadhaarFieldWrap').style.borderColor='var(--glass-border)'"
            >
          </div>
          <p style="font-size:12px; color:var(--text3); margin-top:6px;">Enter only the last 4 digits of your Aadhaar</p>
        </div>
      </div>

      <!-- OTP section (hidden until Send OTP is clicked) -->
      <div id="bookOTPSection" style="display:none;">
        <div style="height:1px; background:var(--glass-border); margin:4px 0 20px;"></div>
        <p style="font-size:13px; color:var(--text3); margin-bottom:16px;">Enter the 6-digit OTP sent to your email</p>
        <div class="otp-grid">
          <input type="text" class="otp-input book-otp" maxlength="1" inputmode="numeric">
          <input type="text" class="otp-input book-otp" maxlength="1" inputmode="numeric">
          <input type="text" class="otp-input book-otp" maxlength="1" inputmode="numeric">
          <input type="text" class="otp-input book-otp" maxlength="1" inputmode="numeric">
          <input type="text" class="otp-input book-otp" maxlength="1" inputmode="numeric">
          <input type="text" class="otp-input book-otp" maxlength="1" inputmode="numeric">
        </div>
        <button class="btn-primary btn-full" onclick="verifyBookingOTP()" style="margin-top:12px;">Verify OTP &amp; Continue</button>
        <p style="text-align:center; margin-top:12px;">
          <a href="#" onclick="resendOTP(); return false;" style="color:var(--accent); font-size:13px;">Resend OTP</a>
        </p>
      </div>

      <div id="bookSendOTPBtn" style="margin-top:8px;">
        <button class="btn-primary btn-full" onclick="sendBookingOTP()">Send OTP</button>
      </div>
    `;

  } else if (step === 2) {
    // Step 2: Date picker
    const dates = DB.getEnabledDates();
    const dateOptions = dates.length === 0
      ? '<p style="color:var(--text3); font-size:14px; text-align:center; padding:20px;">No dates available at the moment. Please contact us directly.</p>'
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

    document.getElementById('bookingModalTitle').textContent = 'Choose Date';
    body.innerHTML = stepIndicator + `
      <p style="font-size:14px; color:var(--text2); margin-bottom:20px;">Select your preferred appointment date. Only available dates are shown.</p>
      <div class="date-grid">${dateOptions}</div>
      <div style="display:flex; gap:12px; margin-top:24px;">
        <button class="btn-secondary" onclick="renderBookingStep(1)" style="flex:1; justify-content:center;">Back</button>
        <button class="btn-primary" onclick="submitBookingStep2()" style="flex:2; justify-content:center;">Confirm Booking</button>
      </div>
    `;

  } else if (step === 3) {
    // Step 3: Confirmation
    const booking = sessionBookingData.confirmedBooking;
    document.getElementById('bookingModalTitle').textContent = 'Booking Confirmed';

    const d = new Date(booking.date + 'T00:00:00');
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const displayDate = `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;

    body.innerHTML = stepIndicator + `
      <div class="booking-confirm">
        <div style="width:80px;height:80px;margin:0 auto 16px;">
          <svg viewBox="0 0 80 80" style="width:80px;height:80px;">
            <circle cx="40" cy="40" r="36" fill="none" stroke="rgba(16,185,129,0.3)" stroke-width="3"/>
            <circle cx="40" cy="40" r="36" fill="none" stroke="#34d399" stroke-width="3" stroke-dasharray="226" stroke-dashoffset="226" stroke-linecap="round" class="anim-circle"/>
            <path d="M24 42l12 12 22-24" fill="none" stroke="#34d399" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="56" stroke-dashoffset="56" class="anim-check"/>
          </svg>
        </div>
        <h3 style="font-family:'Space Grotesk',sans-serif;font-size:18px;font-weight:700;margin-bottom:8px;">Booking Confirmed</h3>
        <p style="font-size:14px;color:var(--text2);margin-bottom:24px;">Your Aadhaar appointment is booked successfully.</p>

        <div style="text-align:center; margin-bottom:24px;">
          <div style="font-size:12px;color:var(--text3);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.1em;">Your Token Number</div>
          <div style="font-family:'Space Grotesk',sans-serif;font-size:72px;font-weight:700;color:var(--accent);line-height:1;text-shadow:0 0 30px rgba(56,189,248,0.3);">${booking.token}</div>
        </div>

        <div class="booking-id-badge">Booking ID: ${booking.bookingId}</div>

        <div class="booking-detail-grid">
          <div class="booking-detail-row">
            <span class="booking-detail-key">Service</span>
            <span class="booking-detail-val">${booking.service}</span>
          </div>
          <div class="booking-detail-row">
            <span class="booking-detail-key">Aadhaar</span>
            <span class="booking-detail-val" style="font-family:'Space Grotesk',sans-serif; letter-spacing:0.1em;">xxxx xxxx ${booking.aadhaarLast4}</span>
          </div>
          <div class="booking-detail-row">
            <span class="booking-detail-key">Appointment Date</span>
            <span class="booking-detail-val">${displayDate}</span>
          </div>
          <div class="booking-detail-row">
            <span class="booking-detail-key">Status</span>
            <span class="booking-detail-val text-success">Approved</span>
          </div>
        </div>

        <div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.2);border-radius:10px;padding:14px 16px;margin-top:16px;font-size:13px;color:#fbbf24;text-align:left;">
          Please bring your Aadhaar card and supporting documents. Arrive 10 minutes before your token is called.
        </div>

        <div style="display:flex;gap:10px;margin-top:24px;">
          <button class="btn-primary btn-full" onclick="closeBooking()" style="flex:1;justify-content:center;">Done</button>
          <button class="btn-primary btn-full" onclick="window.print()" style="flex:1;justify-content:center;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);">Print</button>
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

  const res = await sendOTP(email);
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
  if (btn) btn.disabled = true;
  const result = await verifyOTP(otp);
  if (btn) btn.disabled = false;
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



function submitBookingStep2() {
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

  sessionBookingData.name = sessionBookingData.name || ('User ' + sessionBookingData.email.split('@')[0]);
  sessionBookingData.service = service;

  const booking = DB.addBooking({
    email: sessionBookingData.email,
    name: sessionBookingData.name,
    aadhaarLast4: sessionBookingData.aadhaarLast4,
    service: sessionBookingData.service,
    date: sessionBookingData.date
  });

  sessionBookingData.confirmedBooking = booking;
  sessionStorage.setItem('myBooking', JSON.stringify(booking));
  updateQueueDisplay();
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
      <p style="font-size:14px; color:var(--text2); margin-bottom:24px;">Enter the last 4 digits of the Aadhaar number used at the time of booking.</p>
      <div class="form-group">
        <label class="form-label">Aadhaar Number (Last 4 Digits)</label>
        <div style="position:relative;">
          <div style="display:flex; align-items:center; gap:0; background:rgba(255,255,255,0.03); border:1px solid var(--glass-border); border-radius:10px; overflow:hidden;">
            <span style="padding:13px 14px; font-size:14px; color:var(--text3); letter-spacing:0.1em; font-family:'Space Grotesk',sans-serif; border-right:1px solid var(--glass-border); background:rgba(255,255,255,0.02); user-select:none; flex-shrink:0;">xxxx xxxx</span>
            <input type="text" id="checkAadhaar" placeholder="XXXX" maxlength="4" inputmode="numeric"
              style="flex:1; background:transparent; border:none; outline:none; padding:13px 14px; color:var(--text); font-size:14px; font-family:'Space Grotesk',sans-serif; letter-spacing:0.15em; font-weight:600;"
              onkeydown="if(event.key==='Enter')lookupByAadhaar()">
          </div>
        </div>
      </div>
      <button class="btn-primary btn-full" onclick="lookupByAadhaar()">Check My Token</button>
    `;
  } else if (step === 2) {
    const bookings = DB.getByAadhaar(verifiedAadhaar);
    const ct = DB.currentToken;

    if (bookings.length === 0) {
      body.innerHTML = `
        <div style="text-align:center; padding:32px 0;">
          <div style="font-size:48px; margin-bottom:16px; opacity:0.4;"><i class="fas fa-clipboard-list"></i></div>
          <h3 style="font-size:18px; font-weight:600; margin-bottom:8px;">No Bookings Found</h3>
          <p style="font-size:14px; color:var(--text2); margin-bottom:24px;">We could not find any bookings for Aadhaar ending with <strong>${verifiedAadhaar}</strong>.</p>
          <button class="btn-primary" onclick="closeCheckToken(); openBooking();">Book a Token Now</button>
          <button class="btn-secondary" onclick="renderCheckTokenStep(1)" style="margin-top:8px; justify-content:center;">Try Again</button>
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
      updateQueueDisplay();

      return `
        <div style="background:var(--glass); border:1px solid var(--glass-border); border-radius:14px; padding:20px; margin-bottom:16px;">
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px;">
            <div>
              <div style="font-size:11px;color:var(--text3);margin-bottom:4px;text-transform:uppercase;letter-spacing:0.08em;">Token Number</div>
              <div style="font-family:'Space Grotesk',sans-serif;font-size:42px;font-weight:700;color:var(--accent);line-height:1;">${b.token}</div>
            </div>
            <div class="status-pill ${statusClass}">${statusLabel}</div>
          </div>
          <div style="display:grid; gap:8px;">
            <div style="display:flex; justify-content:space-between; font-size:13px;">
              <span style="color:var(--text3);">Booking ID</span>
              <span style="font-weight:600;">${b.bookingId}</span>
            </div>
            <div style="display:flex; justify-content:space-between; font-size:13px;">
              <span style="color:var(--text3);">Service</span>
              <span style="font-weight:600;">${b.service}</span>
            </div>
            <div style="display:flex; justify-content:space-between; font-size:13px;">
              <span style="color:var(--text3);">Date</span>
              <span style="font-weight:600;">${displayDate}</span>
            </div>
            ${ahead !== null ? `
            <div style="display:flex; justify-content:space-between; font-size:13px;">
              <span style="color:var(--text3);">People Ahead</span>
              <span style="font-weight:600;">${ahead}</span>
            </div>
            <div style="display:flex; justify-content:space-between; font-size:13px;">
              <span style="color:var(--text3);">Est. Wait</span>
              <span style="font-weight:600;">${(ahead + 1) * 15} min</span>
            </div>` : ''}
          </div>
          ${b.status === 'approved' || b.status === 'pending' ? `
            <button class="btn-secondary w-full" style="margin-top:16px; justify-content:center; font-size:13px; color:var(--danger);" onclick="cancelBooking('${b.bookingId}')">Cancel Booking</button>
          ` : ''}
        </div>
      `;
    }).join('');

    body.innerHTML = `
      <p style="font-size:14px; color:var(--text2); margin-bottom:20px;">Found ${bookings.length} booking(s) for Aadhaar ending with <strong>${verifiedAadhaar}</strong>.</p>
      ${bookingCards}
      <button class="btn-secondary btn-full" style="justify-content:center; margin-top:8px;" onclick="renderCheckTokenStep(1)">Check Another</button>
    `;
  }
}

function lookupByAadhaar() {
  const aadhaar = document.getElementById('checkAadhaar').value.trim().replace(/\D/g, '');
  if (aadhaar.length !== 4) {
    notify('Please enter the last 4 digits of your Aadhaar', 'error');
    return;
  }
  verifiedAadhaar = aadhaar;
  renderCheckTokenStep(2);
}

function cancelBooking(bookingId) {
  if (!confirm('Are you sure you want to cancel this booking?')) return;
  const b = DB.bookings.find(x => x.bookingId === bookingId);
  if (b) {
    b.status = 'cancelled';
    DB.save();
    archiveBooking(b);
    sessionStorage.removeItem('myBooking');
    updateQueueDisplay();
    notify('Booking cancelled.', 'info');
    renderCheckTokenStep(2);
  }
}

// ============================================
// ADMIN
// ============================================
function openAdminLogin() {
  window.open('https://indiamobile-admin.vercel.app/', '_blank');
}

function closeAdminLogin() {
  document.getElementById('adminLoginModal').classList.remove('open');
}

function adminLogin() {
  const u = document.getElementById('adminUser').value.trim();
  const p = document.getElementById('adminPass').value.trim();
  if (u === 'admin' && p === 'admin123') {
    closeAdminLogin();
    document.getElementById('adminPanel').classList.add('open');
    refreshAdminData();
    renderAdminDates();
    document.getElementById('adminTokenDisplay').textContent = String(DB.currentToken).padStart(2, '0');
  } else {
    notify('Incorrect credentials', 'error');
  }
}

function closeAdmin() {
  document.getElementById('adminPanel').classList.remove('open');
}

function switchAdminTab(tab, btn) {
  document.querySelectorAll('.admin-tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('adminTab' + tab.charAt(0).toUpperCase() + tab.slice(1)).classList.add('active');
}

function refreshAdminData() {
  const bookings = DB.bookings;
  document.getElementById('adminTotalBookings').textContent = bookings.length;
  document.getElementById('adminPending').textContent = bookings.filter(b => b.status === 'pending').length;
  document.getElementById('adminApproved').textContent = bookings.filter(b => b.status === 'approved').length;
  document.getElementById('adminCompleted').textContent = bookings.filter(b => b.status === 'completed').length;

  const today = new Date().toISOString().split('T')[0];
  const todayBookings = bookings.filter(b => b.date === today);
  document.getElementById('adminTokensIssued').textContent = todayBookings.length;
  document.getElementById('adminInQueue').textContent = bookings.filter(b => b.status === 'approved').length;
  document.getElementById('adminCompletedToday').textContent = bookings.filter(b => b.status === 'completed').length;

  renderBookingsTable(bookings);
}

function renderBookingsTable(bookings) {
  const tbody = document.getElementById('bookingsTableBody');
  if (bookings.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:32px; color:var(--text3);">No bookings yet</td></tr>';
    return;
  }

  tbody.innerHTML = bookings.map(b => {
    const d = new Date(b.date + 'T00:00:00');
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const displayDate = `${d.getDate()} ${months[d.getMonth()]}`;
    return `
      <tr>
        <td><span class="token-badge">${b.token}</span></td>
        <td style="font-size:12px; color:var(--text3);">${b.bookingId}</td>
        <td style="font-weight:500;">${b.name}</td>
        <td>${b.email || '--'}</td>
        <td style="font-size:13px;">${b.service}</td>
        <td style="font-size:13px;">${displayDate}</td>
        <td><span class="status-pill ${b.status}">${b.status.charAt(0).toUpperCase()+b.status.slice(1)}</span></td>
        <td>
          <div class="action-btns">
            ${b.status !== 'completed' && b.status !== 'cancelled' ? `<button class="action-btn success" onclick="updateBookingStatus('${b.bookingId}','completed')">Complete</button>` : ''}
            ${b.status === 'pending' ? `<button class="action-btn" onclick="updateBookingStatus('${b.bookingId}','approved')">Approve</button>` : ''}
            ${b.status !== 'cancelled' && b.status !== 'completed' ? `<button class="action-btn danger" onclick="updateBookingStatus('${b.bookingId}','cancelled')">Cancel</button>` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function filterBookings() {
  const q = document.getElementById('adminSearch').value.toLowerCase();
  const status = document.getElementById('adminStatusFilter').value;
  let filtered = DB.bookings;
  if (status) filtered = filtered.filter(b => b.status === status);
  if (q) filtered = filtered.filter(b =>
    b.name.toLowerCase().includes(q) ||
    (b.email || '').toLowerCase().includes(q) ||
    b.bookingId.toLowerCase().includes(q) ||
    b.aadhaarLast4.includes(q)
  );
  renderBookingsTable(filtered);
}

function updateBookingStatus(bookingId, status) {
  const b = DB.bookings.find(x => x.bookingId === bookingId);
  if (b) {
    b.status = status;
    DB.save();
    if (status === 'completed' || status === 'cancelled') archiveBooking(b);
    refreshAdminData();
    updateQueueDisplay();
    notify('Booking updated to ' + status, 'success');
  }
}

function changeToken(delta) {
  DB.currentToken = Math.max(1, DB.currentToken + delta);
  DB.save();
  document.getElementById('adminTokenDisplay').textContent = String(DB.currentToken).padStart(2, '0');
  updateQueueDisplay();
  notify('Token updated to ' + String(DB.currentToken).padStart(2,'0'), 'info');
}

function markNextComplete() {
  const active = DB.bookings.find(b => parseInt(b.token) === DB.currentToken && (b.status === 'approved' || b.status === 'pending'));
  if (active) {
    active.status = 'completed';
    DB.save();
    archiveBooking(active);
    refreshAdminData();
    notify('Token ' + String(DB.currentToken).padStart(2,'0') + ' marked complete', 'success');
  } else {
    notify('No active booking for current token', 'info');
  }
}

function advanceToken() {
  DB.currentToken += 1;
  DB.save();
  document.getElementById('adminTokenDisplay').textContent = String(DB.currentToken).padStart(2, '0');
  updateQueueDisplay();
  notify('Advanced to next token', 'info');
}

function skipToken() {
  DB.currentToken += 1;
  DB.save();
  document.getElementById('adminTokenDisplay').textContent = String(DB.currentToken).padStart(2, '0');
  updateQueueDisplay();
  notify('Token skipped', 'info');
}

function renderAdminDates() {
  const grid = document.getElementById('adminDateGrid');
  grid.innerHTML = DB.enabledDates.map((d, i) => {
    const date = new Date(d.date + 'T00:00:00');
    const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `
      <div class="date-manage-item ${d.enabled ? 'enabled' : ''}" onclick="toggleDate(${i})">
        <div class="date-manage-item-day">${days[date.getDay()]}</div>
        <div class="date-manage-item-num">${date.getDate()}</div>
        <div class="date-manage-item-month" style="font-size:12px;color:var(--text3);">${months[date.getMonth()]}</div>
        <div class="date-manage-item-status">${d.enabled ? '● Enabled' : '○ Disabled'}</div>
      </div>
    `;
  }).join('');
}

function toggleDate(index) {
  DB.enabledDates[index].enabled = !DB.enabledDates[index].enabled;
  DB.save();
  renderAdminDates();
  notify('Date ' + (DB.enabledDates[index].enabled ? 'enabled' : 'disabled'), 'info');
}

// ============================================
// CONTACT FORM
// ============================================
function submitContactForm() {
  const name = document.getElementById('contactName').value.trim();
  const phone = document.getElementById('contactPhone').value.trim();
  const msg = document.getElementById('contactMessage').value.trim();
  if (!name || !phone || !msg) {
    notify('Please fill in all required fields', 'error');
    return;
  }
  notify('Message sent! We will get back to you soon.', 'success');
  document.getElementById('contactName').value = '';
  document.getElementById('contactPhone').value = '';
  document.getElementById('contactEmail').value = '';
  document.getElementById('contactMessage').value = '';
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
  const logo = e.target.closest('.logo-icon, .nav-logo');
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

// Demo data seeding removed

updateQueueDisplay();

// ============================================
// BILINGUAL LANGUAGE SYSTEM (HINDI / ENGLISH)
// ============================================
const translations = {
  hi: {
    nav_services: "सेवाएं",
    nav_about: "हमारे बारे में",
    nav_queue: "लाइव कतार",
    nav_location: "स्थान",
    nav_contact: "संपर्क",
    btn_check_token: "टोकन जांचें",
    check_token_sub: "अपनी बुकिंग स्थिति, कतार स्थान और अनुमानित प्रतीक्षा समय देखें।",
    services_tag: "सेवाएं",
    services_title: "हम आपकी क्या सहायता कर सकते हैं?",
    services_subtitle: "हम विभिन्न सरकारी और डिजिटल सेवाएं प्रदान करते हैं। अपनी बुकिंग शुरू करने के लिए नीचे एक सेवा चुनें।",
    services_select_lbl: "बुक करने के लिए सेवा चुनें",
    service_choose: "-- सेवा चुनें --",
    service_aadhaar: "आधार अपडेट",
    service_pan: "पैन सेवाएं (जल्द ही आ रहा है)",
    service_passport: "पासपोर्ट सेवाएं (जल्द ही आ रहा है)",
    service_online: "ऑनलाइन आवेदन (जल्द ही आ रहा है)",
    service_ticket: "टिकट बुकिंग (जल्द ही आ रहा है)",
    coming_soon_note: "यह सेवा जल्द ही आ रही है। कृपया बाद में पुनः देखें या सहायता के लिए हमसे संपर्क करें।",
    about_tag: "स्थापना 2018",
    about_title: "आपका विश्वसनीय डिजिटल सेवा भागीदार",
    about_subtitle: "इंडिया मोबाइल सेंटर की स्थापना सरकारी सेवाओं को सभी के लिए सरल और सुलभ बनाने के लिए की गई थी। चाहे आपको अपना आधार अपडेट करना हो, दस्तावेजों के लिए आवेदन करना हो, या डिजिटल फॉर्म भरने में मदद चाहिए हो, हम यहां आपकी सहायता के लिए हैं।",
    about_desc: "हम समझते हैं कि सरकारी प्रक्रियाएं जटिल लग सकती हैं। हमारा प्रशिक्षित स्टाफ हर कदम पर आपका मार्गदर्शन करता है, हर बार एक सहज और सफल अनुभव सुनिश्चित करता है।",
    highlight_years: "सेवा के वर्ष",
    highlight_customers: "खुश ग्राहक",
    highlight_success: "सफलता दर",
    highlight_fast: "तेज़ प्रोसेसिंग",
    why_tag: "हमें क्यों चुनें",
    why_title: "आपकी सुविधा के लिए निर्मित",
    why_subtitle: "हम जो कुछ भी करते हैं वह आपकी यात्रा को आसान, तेज़ और तनाव मुक्त बनाने के लिए डिज़ाइन किया गया है।",
    feat1_title: "तेज़ सेवा",
    feat1_desc: "हम अपने टोकन-आधारित कतार सिस्टम के साथ प्रतीक्षा समय को कम रखते हैं। ऑनलाइन बुक करें और समय पर पहुंचें — कोई अनावश्यक प्रतीक्षा नहीं।",
    feat2_title: "सुरक्षित प्रक्रिया",
    feat2_desc: "आपकी व्यक्तिगत जानकारी को सख्त गोपनीयता के साथ संभाला जाता है। हम सभी सरकारी सुरक्षा दिशानिर्देशों का पालन करते हैं।",
    feat3_title: "डिजिटल बुकिंग",
    feat3_desc: "किसी भी समय, अपने फोन से अपॉइंटमेंट बुक करें। ओटीपी सत्यापन सुनिश्चित करता है कि आपकी बुकिंग सुरक्षित है।",
    feat4_title: "कतार ट्रैकिंग",
    feat4_desc: "वास्तविक समय में अपने टोकन की स्थिति और लाइव कतार की स्थिति की जांच करें। आपको हमेशा पता रहेगा कि आपकी बारी कब आ रही है।",
    feat5_title: "विश्वसनीय सहायता",
    feat5_desc: "हमारा अनुभवी स्टाफ हर कदम पर आपकी सहायता के लिए तैयार है। हम आपकी भाषा बोलते हैं और आपकी आवश्यकताओं को समझते हैं।",
    feat6_title: "व्यावसायिक सहायता",
    feat6_desc: "फॉर्म भरने से लेकर दस्तावेज सत्यापन तक, हम यह सुनिश्चित करते हैं कि आपका आवेदन पहली बार में ही पूरा और सही हो।",
    stats_tag: "आंकड़े",
    stats_title: "हमारा ट्रैक रिकॉर्ड",
    stat_served: "सेवा किए गए ग्राहक",
    stat_completed: "आधार अपडेट पूर्ण",
    stat_years: "अनुभव के वर्ष",
    stat_satisfaction: "ग्राहक संतुष्टि %",
    queue_tag: "लाइव कतार",
    queue_title: "वास्तविक समय टोकन स्थिति",
    queue_subtitle: "वर्तमान कतार देखें और अपनी स्थिति को लाइव ट्रैक करें।",
    queue_live: "लाइव कतार",
    current_token_lbl: "वर्तमान टोकन",
    your_token_lbl: "आपका टोकन",
    people_ahead_lbl: "आपके आगे लोग",
    est_wait_lbl: "अनुमानित प्रतीक्षा",
    refresh_info: "हर 30 सेकंड में स्वतः ताज़ा होता है",
    reviews_tag: "ग्राहक समीक्षाएं",
    reviews_title: "हमारे ग्राहक क्या कहते हैं",
    team_tag: "हमारी टीम",
    team_title: "हमारे विश्वसनीय स्टाफ से मिलें",
    team_subtitle: "अनुभवी पेशेवर जो देखभाल और दक्षता के साथ आपकी सेवा करने के लिए समर्पित हैं।",
    team_role_dev: "वेब डेवलपर",
    team_exp_dev: "5+ वर्ष का अनुभव",
    team_desc_dev: "इंडिया मोबाइल डिजिटल प्लेटफॉर्म का निर्माण और रखरखाव करते हैं। स्वच्छ कोड और आधुनिक डिज़ाइन के माध्यम से सहज उपयोगकर्ता अनुभव बनाने के प्रति जुनूनी।",
    team_up_mukhiya: "(यूपी मुखिया)",
    team_role_founder: "मालिक और संस्थापक",
    team_exp_founder: "12+ वर्ष का अनुभव",
    team_desc_founder: "सरकारी सेवाओं को सुलभ बनाने की दृष्टि से इंडिया मोबाइल सेंटर की स्थापना की। डिजिटल सेवा वितरण और सामुदायिक समर्थन में एक दशक से अधिक का अनुभव।",
    team_role_support: "ग्राहक सहायता प्रमुख",
    team_exp_support: "6+ वर्ष का अनुभव",
    team_desc_support: "ग्राहक सहायता टीम का नेतृत्व करते हैं और सुनिश्चित करते हैं कि हर आगंतुक को बुकिंग से लेकर सेवा पूर्ण होने तक त्वरित सहायता मिले।",
    team_role_biometric: "बायोमेट्रिक ऑपरेटर",
    team_exp_biometric: "4+ वर्ष का अनुभव",
    team_desc_biometric: "प्रमाणित बायोमेट्रिक ऑपरेटर जो आधार नामांकन और अपडेट संभालते हैं। हर ग्राहक के साथ धैर्यपूर्ण और संपूर्ण सेवा के लिए जाने जाते हैं।",
    find_us_tag: "हमें खोजें",
    find_us_title: "हमारा स्थान",
    addr_lbl: "पता",
    phone_lbl: "फोन",
    whatsapp_lbl: "व्हाट्सएप",
    addr_val: "दुकान नंबर 12, मुख्य बाजार मार्ग",
    addr_sub: "पटना, बिहार — 800001",
    call_hours: "कार्य समय के दौरान कॉल करें",
    msg_anytime: "हमें कभी भी संदेश भेजें",
    hours_lbl: "कार्य समय",
    hours_val: "सोमवार – शनिवार",
    hours_sub: "सुबह 9:00 – शाम 5:00 बजे",
    email_lbl: "ईमेल",
    email_sub: "हम 24 घंटे के भीतर जवाब देते हैं",
    contact_tag: "संपर्क करें",
    contact_title: "हमसे जुड़ें",
    contact_desc: "हमारी सेवाओं के बारे में कोई प्रश्न? अपनी बुकिंग में सहायता चाहिए? हम आपकी सहायता के लिए यहां हैं। संपर्क करें और हम तुरंत जवाब देंगे।",
    faq1_q: "आधार अपडेट में कितना समय लगता है?",
    faq1_a: "हमारे केंद्र पर सफल बायोमेट्रिक सत्यापन के बाद, आधार अपडेट आमतौर पर UIDAI द्वारा 30 से 90 दिनों के भीतर दिखाई देते हैं। हम प्रक्रिया में आपका मार्गदर्शन करेंगे और आपको स्वीकृति पर्ची देंगे।",
    faq2_q: "मुझे कौन से दस्तावेज लाने होंगे?",
    faq2_a: "आवश्यकताएं अपडेट के प्रकार के अनुसार भिन्न होती हैं। पता अपडेट के लिए, पते का प्रमाण (बिजली का बिल, किराया समझौता, आदि) लाएं। नाम सुधार के लिए, सही नाम वाला कानूनी दस्तावेज लाएं। अपनी सेवा के लिए पूरी सूची हमसे संपर्क करें।",
    faq3_q: "क्या मैं किसी और के लिए बुक कर सकता हूं?",
    faq3_a: "हां। आप परिवार के किसी सदस्य के लिए टोकन बुक कर सकते हैं। बुकिंग के दौरान उनके आधार के अंतिम 4 अंकों का उपयोग करें। कृपया सुनिश्चित करें कि व्यक्ति शारीरिक रूप से उपस्थित हो क्योंकि बायोमेट्रिक्स आवश्यक हैं।",
    faq4_q: "सेवा शुल्क क्या है?",
    faq4_a: "UIDAI द्वारा निर्धारित सरकारी शुल्क लागू होते हैं। हमारा सेवा सहायता शुल्क नाममात्र है। अपनी विशिष्ट सेवा के लिए वर्तमान शुल्क संरचना के लिए कृपया सीधे हमसे संपर्क करें।",
    contact_form_title: "हमें संदेश भेजें",
    form_name: "आपका नाम",
    form_name_placeholder: "अपना पूरा नाम दर्ज करें",
    form_phone: "मोबाइल नंबर",
    form_phone_placeholder: "+91 XXXXX XXXXX",
    form_email: "ईमेल (वैकल्पिक)",
    form_email_placeholder: "your@email.com",
    form_message: "संदेश",
    form_message_placeholder: "अपनी पूछताछ या आवश्यकता का वर्णन करें...",
    form_send: "संदेश भेजें",
    guidelines_header: "दस्तावेज़ दिशानिर्देश",
    guide_aadhaar_title: "आधार अपडेट",
    guide_aadhaar_text: "मूल आधार कार्ड + स्वयं-सत्यापित प्रति, वैध फोटो आईडी (वोटर आईडी / ड्राइविंग लाइसेंस / पासपोर्ट), 2 हालिया पासपोर्ट साइज़ फ़ोटो, और यदि लागू हो तो बदलाव के लिए सहायक दस्तावेज़ (विवाह प्रमाण पत्र, पता प्रमाण, आदि)।",
    guide_pan_title: "पैन सेवाएं",
    guide_pan_text: "आधार कार्ड, मौजूदा पैन कार्ड (पुनः जारी/सुधार के लिए), पते का प्रमाण (उपयोगिता बिल / बैंक स्टेटमेंट / किराया समझौता), 2 पासपोर्ट साइज़ फ़ोटो, और स्व-घोषणा पत्र।",
    guide_passport_title: "पासपोर्ट सेवाएं",
    guide_passport_text: "आधार कार्ड, पते का प्रमाण (उपयोगिता बिल / आधार / बैंक स्टेटमेंट), जन्म प्रमाण पत्र या कक्षा 10 की अंक तालिका, 10 पासपोर्ट साइज़ फ़ोटो, और भरे हुए अनुलग्नक फॉर्म (अनुलग्नक A / E / F जैसा लागू हो)।",
    guide_online_title: "ऑनलाइन आवेदन",
    guide_online_text: "आधार कार्ड, पैन कार्ड, हालिया पासपोर्ट साइज़ फ़ोटो, आय प्रमाण पत्र और जाति प्रमाण पत्र (यदि आवश्यक हो), PDF/JPEG प्रारूप में सभी प्रासंगिक दस्तावेजों की स्कैन की गई प्रतियां, और OTP सत्यापन के लिए एक वैध मोबाइल नंबर।",
    guide_ticket_title: "टिकट बुकिंग",
    guide_ticket_text: "सरकार द्वारा जारी वैध फोटो आईडी (आधार / वोटर आईडी / ड्राइविंग लाइसेंस / पासपोर्ट), पुष्टि के लिए मोबाइल नंबर, और भुगतान विधि (नकद / UPI / कार्ड)।",
    guide_tips_title: "सामान्य सुझाव",
    guide_tips_text: "मूल दस्तावेज + प्रत्येक की कम से कम 2 स्वयं-सत्यापित प्रतियां ले जाएं। फ़ोटो सफेद पृष्ठभूमि पर, हालिया (6 महीने के भीतर) होनी चाहिए। 15 मिनट पहले पहुंचें। किसी भी सुधार/बदलाव के लिए, प्रासंगिक सहायक प्रमाण पत्र लाएं।",
    footer_desc: "आधार और डिजिटल सरकारी सेवाओं के लिए आपका विश्वसनीय भागीदार। सभी के लिए तेज़, सुरक्षित और पेशेवर सहायता।",
    footer_quicklinks: "त्वरित लिंक",
    footer_home: "होम",
    footer_services: "सेवाएं",
    footer_about: "हमारे बारे में",
    footer_queue: "लाइव कतार",
    footer_location: "स्थान",
    footer_contact: "संपर्क",
    footer_serv_title: "सेवाएं",
    footer_mobile_link: "मोबाइल लिंक",
    footer_addr_update: "पता अपडेट",
    footer_bio_update: "बायोमेट्रिक अपडेट",
    footer_name_corr: "नाम सुधार",
    footer_contact_title: "संपर्क",
    footer_whatsapp: "व्हाट्सएप करें",
    footer_hours: "सोम–शनि, सुबह 9–शाम 5",
    footer_copyright: "© 2025 इंडिया मोबाइल सेंटर। सर्वाधिकार सुरक्षित।",
    footer_auth: "अधिकृत आधार सेवा प्रदाता",
    booking_modal_title: "आधार टोकन बुक करें",
    check_modal_title: "टोकन जांचें",
    admin_modal_title: "व्यवस्थापक लॉगिन",
    admin_user_label: "उपयोगकर्ता नाम",
    admin_user_placeholder: "admin",
    admin_pass_label: "पासवर्ड",
    admin_pass_placeholder: "••••••••",
    admin_login_btn: "डैशबोर्ड में लॉगिन करें",
    admin_default_creds: "डिफ़ॉल्ट: admin / admin123",
    admin_nav_title: "इंडिया मोबाइल व्यवस्थापक",
    admin_dashboard_label: "डैशबोर्ड",
    admin_exit_btn: "डैशबोर्ड से बाहर निकलें",
    admin_total_bookings: "कुल बुकिंग",
    admin_pending: "लंबित",
    admin_approved: "स्वीकृत",
    admin_completed: "पूर्ण",
    admin_tab_bookings: "बुकिंग",
    admin_tab_queue: "कतार नियंत्रण",
    admin_tab_dates: "तिथियां प्रबंधित करें",
    admin_search_placeholder: "नाम, फोन, बुकिंग आईडी, आधार द्वारा खोजें...",
    admin_filter_all: "सभी स्थिति",
    admin_filter_pending: "लंबित",
    admin_filter_approved: "स्वीकृत",
    admin_filter_completed: "पूर्ण",
    admin_filter_cancelled: "रद्द",
    admin_th_token: "टोकन",
    admin_th_booking_id: "बुकिंग आईडी",
    admin_th_name: "नाम",
    admin_th_mobile: "मोबाइल",
    admin_th_service: "सेवा",
    admin_th_date: "तारीख",
    admin_th_status: "स्थिति",
    admin_th_actions: "कार्रवाई",
    admin_serving_token: "वर्तमान में सेवा प्राप्त टोकन",
    admin_serving_desc: "लाइव कतार प्रदर्शन को अपडेट करने के लिए बदलें",
    admin_today_summary: "आज का सारांश",
    admin_tokens_issued: "जारी किए गए टोकन",
    admin_in_queue: "कतार में",
    admin_completed_today: "आज पूर्ण हुए",
    admin_quick_actions: "त्वरित कार्रवाई",
    admin_mark_complete: "वर्तमान टोकन को पूर्ण चिह्नित करें",
    admin_advance_token: "अगले टोकन पर जाएं",
    admin_skip_token: "वर्तमान टोकन छोड़ें",
    admin_enable_dates: "बुकिंग तिथियां सक्षम करें",
    admin_enable_dates_desc: "ग्राहक बुकिंग के लिए तिथि को सक्षम या अक्षम करने के लिए क्लिक करें। केवल सक्षम तिथियां बुकिंग फॉर्म में दिखाई देंगी।"
  },
  en: {
    nav_services: "Services",
    nav_about: "About",
    nav_queue: "Queue",
    nav_location: "Location",
    nav_contact: "Contact",
    btn_check_token: "Check My Token",
    check_token_sub: "View your booking status, queue position & estimated wait time",
    services_tag: "Services",
    services_title: "What Can We Help You With?",
    services_subtitle: "We provide a range of government and digital services. Select a service below to get started with your booking.",
    services_select_lbl: "Select a Service to Book",
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
    queue_tag: "Live Queue",
    queue_title: "Real-Time Token Status",
    queue_subtitle: "See the current queue and track your position live.",
    queue_live: "Live Queue",
    current_token_lbl: "Current Token",
    your_token_lbl: "Your Token",
    people_ahead_lbl: "People Ahead of You",
    est_wait_lbl: "Estimated Wait",
    refresh_info: "Auto-refreshes every 30 seconds",
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
    guide_aadhaar_text: "Original Aadhaar card + self-attested copy, valid photo ID (Voter ID / Driving License / Passport), 2 recent passport-size photographs, and any supporting document for change (marriage certificate, address proof, etc.) if applicable.",
    guide_pan_title: "PAN Services",
    guide_pan_text: "Aadhaar card, existing PAN card (for re-issue/correction), proof of address (utility bill / bank statement / rent agreement), 2 passport-size photos, and self-declaration form.",
    guide_passport_title: "Passport Services",
    guide_passport_text: "Aadhaar card, proof of address (utility bill / Aadhaar / bank statement), birth certificate or class 10 mark sheet, 10 passport-size photos, and filled annexure forms (Annexure A / E / F as applicable).",
    guide_online_title: "Online Applications",
    guide_online_text: "Aadhaar card, PAN card, recent passport-size photo, income certificate & caste certificate (if required), scanned copies of all relevant documents in PDF/JPEG format, and a valid mobile number for OTP verification.",
    guide_ticket_title: "Ticket Booking",
    guide_ticket_text: "Valid government-issued photo ID (Aadhaar / Voter ID / Driving License / Passport), mobile number for confirmation, and payment method (cash / UPI / card).",
    guide_tips_title: "General Tips",
    guide_tips_text: "Carry original documents + at least 2 self-attested copies of each. Photos should be white background, recent (within 6 months). Reach 15 minutes early. For any correction/change, bring relevant supporting certificate.",
    footer_desc: "Your trusted partner for Aadhaar and digital government services. Fast, secure, and professional assistance for everyone.",
    footer_quicklinks: "Quick Links",
    footer_home: "Home",
    footer_services: "Services",
    footer_about: "About Us",
    footer_queue: "Live Queue",
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
    admin_user_placeholder: "admin",
    admin_pass_label: "Password",
    admin_pass_placeholder: "••••••••",
    admin_login_btn: "Login to Dashboard",
    admin_default_creds: "Default: admin / admin123",
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
    admin_today_summary: "Today's Summary",
    admin_tokens_issued: "Tokens Issued",
    admin_in_queue: "In Queue",
    admin_completed_today: "Completed Today",
    admin_quick_actions: "Quick Actions",
    admin_mark_complete: "Mark Current Token Complete",
    admin_advance_token: "Advance to Next Token",
    admin_skip_token: "Skip Current Token",
    admin_enable_dates: "Enable Booking Dates",
    admin_enable_dates_desc: "Click on a date to enable or disable it for customer bookings. Only enabled dates will appear in the booking form."
  }
};

let currentLang = localStorage.getItem('site_lang') || 'hi';

window.setLanguage = function(lang) {
  currentLang = lang;
  localStorage.setItem('site_lang', lang);
  document.documentElement.lang = lang;

  document.querySelectorAll('[data-translate]').forEach(el => {
    const key = el.getAttribute('data-translate');
    if (translations[lang] && translations[lang][key]) {
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        el.placeholder = translations[lang][key];
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
};

window.toggleLanguage = function() {
  const nextLang = currentLang === 'hi' ? 'en' : 'hi';
  window.setLanguage(nextLang);
};

// Apply default language as Hindi
window.setLanguage(currentLang);
