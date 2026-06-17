// ============================================
// DATA STORE (localStorage-based for demo)
// ============================================
const DB = {
  bookings: [],
  currentToken: 7,
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
    const targetDays = [2, 5]; // Tuesday, Friday
    for (let i = 1; i <= 7; i++) {
      const d = new Date(now);
      d.setDate(now.getDate() + i);
      if (targetDays.includes(d.getDay())) {
        dates.push({ date: d.toISOString().split('T')[0], enabled: true });
      }
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

  getByPhone(phone) {
    return this.bookings.filter(b => b.phone === phone && b.status !== 'cancelled');
  },

  getActiveByPhone(phone) {
    return this.bookings.find(b => b.phone === phone && (b.status === 'pending' || b.status === 'approved'));
  },

  getActiveByAadhaar(aadhaar) {
    return this.bookings.find(b => b.aadhaarLast4 === aadhaar && (b.status === 'pending' || b.status === 'approved'));
  }
};

DB.load();

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
let sessionPhone = null;
let sessionBookingData = {};
let currentBookingStep = 1;
let checkTokenStep = 1;
let verifiedPhoneForCheck = null;
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
}

function closeMobileMenu() {
  document.getElementById('mobileMenu').classList.remove('open');
}

document.addEventListener('click', function(e) {
  const mm = document.getElementById('mobileMenu');
  const hb = document.getElementById('hamburger');
  if (mm.classList.contains('open') && !mm.contains(e.target) && !hb.contains(e.target)) {
    mm.classList.remove('open');
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
// OTP API (Firebase Phone Auth - v9 modular)
// ============================================
async function sendOTP(phone) {
  return await window.sendOTP(phone);
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
      inputs.forEach((inp2, j) => {
        inp2.value = text[j] || '';
      });
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

      <!-- Mobile Number -->
      <div class="form-group">
        <label class="form-label">Mobile Number</label>
        <div style="display:flex; align-items:center; gap:0; background:rgba(255,255,255,0.03); border:1px solid var(--glass-border); border-radius:10px; overflow:hidden; transition:border-color 0.2s;" id="phoneFieldWrap">
          <span style="padding:13px 14px; font-size:14px; color:var(--text); font-family:'Space Grotesk',sans-serif; letter-spacing:0.1em; border-right:1px solid var(--glass-border); background:rgba(255,255,255,0.02); user-select:none; flex-shrink:0;">+91</span>
          <input type="tel" class="form-input" id="bookPhone" placeholder="Enter 10-digit mobile number" maxlength="10" inputmode="numeric" value="${sessionBookingData.phone || ''}"
            style="flex:1; background:transparent; border:none; outline:none; padding:13px 14px; color:var(--text); font-size:14px; font-family:'Space Grotesk',sans-serif; letter-spacing:0.15em; font-weight:600;"
            onfocus="document.getElementById('phoneFieldWrap').style.borderColor='rgba(59,130,246,0.5)'"
            onblur="document.getElementById('phoneFieldWrap').style.borderColor='var(--glass-border)'"
          >
        </div>
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
        <p style="font-size:13px; color:var(--text3); margin-bottom:16px;">Enter the 6-digit OTP sent to your mobile number</p>
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
          <a href="#" onclick="resendOTP('book'); return false;" style="color:var(--accent); font-size:13px;">Resend OTP</a>
        </p>
      </div>

      <div id="bookSendOTPBtn" style="margin-top:8px;">
        <button class="btn-primary btn-full" onclick="sendBookingOTP()">Send OTP to Verify</button>
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
  const phone = document.getElementById('bookPhone').value.trim().replace(/\D/g, '');
  if (phone.length !== 10) {
    notify('Please enter a valid 10-digit mobile number', 'error');
    return;
  }

  const aadhaarLast4 = document.getElementById('bookAadhaarLast4').value.trim().replace(/\D/g, '');
  if (aadhaarLast4.length !== 4) {
    notify('Please enter the last 4 digits of your Aadhaar', 'error');
    return;
  }

  const existing = DB.getActiveByPhone(phone);
  if (existing) {
    notify('You already have an active booking (Token #' + existing.token + '). Please cancel it first or check your token.', 'error');
    return;
  }

  sessionBookingData.phone = phone;
  sessionBookingData.aadhaarLast4 = aadhaarLast4;

  const res = await sendOTP(phone);
  if (res.success) {
    notify('OTP sent to ' + phone, 'success');
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
    notify('Phone verified successfully!', 'success');
    renderBookingStep(2);
  } else {
    notify(result.message || 'Incorrect OTP. Please try again.', 'error');
  }
}

async function resendOTP(prefix) {
  if (sessionPhone) {
    const res = await sendOTP(sessionPhone);
    if (res.success) notify('OTP resent', 'success');
    else notify(res.message || 'Failed to resend OTP', 'error');
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
  if (existingAadhaar && existingAadhaar.phone !== sessionBookingData.phone) {
    notify('This Aadhaar number already has an active booking.', 'error');
    return;
  }

  sessionBookingData.name = sessionBookingData.name || ('User ' + sessionBookingData.phone.slice(-4));
  sessionBookingData.service = service;

  const booking = DB.addBooking({
    phone: sessionBookingData.phone,
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
  checkTokenStep = 1;
  verifiedPhoneForCheck = null;
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
      <p style="font-size:14px; color:var(--text2); margin-bottom:24px;">Enter the mobile number you used when booking your token.</p>
      <div class="form-group">
        <label class="form-label">Registered Mobile Number</label>
        <input type="tel" class="form-input" id="checkPhone" placeholder="10-digit mobile number" maxlength="10" inputmode="numeric">
      </div>
      <div id="checkOTPSection" style="display:none;">
        <p style="font-size:13px; color:var(--text3); margin-bottom:16px;">Enter the 6-digit OTP sent to your number</p>
        <div class="otp-grid">
          <input type="text" class="otp-input check-otp" maxlength="1" inputmode="numeric">
          <input type="text" class="otp-input check-otp" maxlength="1" inputmode="numeric">
          <input type="text" class="otp-input check-otp" maxlength="1" inputmode="numeric">
          <input type="text" class="otp-input check-otp" maxlength="1" inputmode="numeric">
          <input type="text" class="otp-input check-otp" maxlength="1" inputmode="numeric">
          <input type="text" class="otp-input check-otp" maxlength="1" inputmode="numeric">
        </div>
        <button class="btn-primary btn-full" onclick="verifyCheckOTP()">Verify OTP</button>
        <p style="text-align:center; margin-top:12px;">
          <a href="#" onclick="resendOTP('check'); return false;" style="color:var(--accent); font-size:13px;">Resend OTP</a>
        </p>
      </div>
      <div id="checkSendBtn">
        <button class="btn-primary btn-full" onclick="sendCheckOTP()">Send OTP</button>
      </div>
    `;
    setTimeout(() => setupOTPInputs('check'), 100);
  } else if (step === 2) {
    const bookings = DB.getByPhone(verifiedPhoneForCheck);
    const ct = DB.currentToken;

    if (bookings.length === 0) {
      body.innerHTML = `
        <div style="text-align:center; padding:32px 0;">
          <div style="font-size:48px; margin-bottom:16px; opacity:0.4;"><i class="fas fa-clipboard-list"></i></div>
          <h3 style="font-size:18px; font-weight:600; margin-bottom:8px;">No Bookings Found</h3>
          <p style="font-size:14px; color:var(--text2); margin-bottom:24px;">We could not find any bookings for this mobile number.</p>
          <button class="btn-primary" onclick="closeCheckToken(); openBooking();">Book a Token Now</button>
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
      <p style="font-size:14px; color:var(--text2); margin-bottom:20px;">Found ${bookings.length} booking(s) for your number.</p>
      ${bookingCards}
    `;
  }
}

async function sendCheckOTP() {
  const phone = document.getElementById('checkPhone').value.trim().replace(/\D/g, '');
  if (phone.length !== 10) {
    notify('Please enter a valid 10-digit mobile number', 'error');
    return;
  }
  verifiedPhoneForCheck = phone;
  const res = await sendOTP(phone);
  if (res.success) {
    notify('OTP sent to ' + phone, 'success');
    document.getElementById('checkSendBtn').style.display = 'none';
    document.getElementById('checkOTPSection').style.display = 'block';
    setTimeout(() => setupOTPInputs('check'), 100);
  } else {
    notify(res.message || 'Failed to send OTP', 'error');
  }
}

async function verifyCheckOTP() {
  const otp = getOTPValue('check');
  if (otp.length !== 6) { notify('Enter the complete 6-digit OTP', 'error'); return; }
  const btn = document.querySelector('#checkTokenBody .btn-primary');
  if (btn) btn.disabled = true;
  const result = await verifyOTP(otp);
  if (btn) btn.disabled = false;
  if (result.success) {
    notify('Phone verified!', 'success');
    renderCheckTokenStep(2);
  } else {
    notify(result.message || 'Incorrect OTP. Please try again.', 'error');
  }
}

function cancelBooking(bookingId) {
  if (!confirm('Are you sure you want to cancel this booking?')) return;
  const b = DB.bookings.find(x => x.bookingId === bookingId);
  if (b) {
    b.status = 'cancelled';
    DB.save();
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
  // Redirect to session-protected admin gateway
  window.location.href = 'admin.php';
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
        <td>${b.phone}</td>
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
    b.phone.includes(q) ||
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
    refreshAdminData();
    notify('Token ' + String(DB.currentToken).padStart(2,'0') + ' marked complete', 'success');
  } else {
    notify('No active booking for current token', 'info');
  }
}

function advanceToken() {
  markNextComplete();
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
    window.location.href = 'admin.php';
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
      window.location.href = 'admin.php';
    }
  }
});

// Add demo bookings for demonstration
(function seedDemoData() {
  if (DB.bookings.length > 0) return;
  const demoBookings = [
    { phone: '9876543210', name: 'Ramesh Kumar', aadhaarLast4: '1234', service: 'Mobile Number Update', date: new Date(Date.now() + 86400000).toISOString().split('T')[0], status: 'approved', token: '01', bookingId: 'DS100001', createdAt: new Date().toISOString() },
    { phone: '9876543211', name: 'Priya Singh', aadhaarLast4: '5678', service: 'Address Update', date: new Date(Date.now() + 86400000).toISOString().split('T')[0], status: 'approved', token: '02', bookingId: 'DS100002', createdAt: new Date().toISOString() },
    { phone: '9876543212', name: 'Amit Sharma', aadhaarLast4: '9012', service: 'Biometric Update', date: new Date(Date.now() + 2*86400000).toISOString().split('T')[0], status: 'pending', token: '03', bookingId: 'DS100003', createdAt: new Date().toISOString() },
    { phone: '9876543213', name: 'Sunita Devi', aadhaarLast4: '3456', service: 'Name Correction', date: new Date(Date.now() - 86400000).toISOString().split('T')[0], status: 'completed', token: '04', bookingId: 'DS100004', createdAt: new Date().toISOString() },
    { phone: '9876543214', name: 'Mohammad Raza', aadhaarLast4: '7890', service: 'Date of Birth Update', date: new Date(Date.now() + 3*86400000).toISOString().split('T')[0], status: 'approved', token: '05', bookingId: 'DS100005', createdAt: new Date().toISOString() },
  ];
  DB.bookings = demoBookings;
  DB.save();
})();

updateQueueDisplay();
