<?php
// ============================================
// PHP BACKEND (must run before any HTML output)
// ============================================
$dataDir = is_writable(__DIR__ . '/data') ? __DIR__ . '/data' : (sys_get_temp_dir() . '/indiamobile_data');
if (!is_dir($dataDir)) @mkdir($dataDir, 0755, true);
$bookingsFile = $dataDir . '/portal_bookings.json';

function loadBookings() {
    global $bookingsFile;
    if (!file_exists($bookingsFile)) return [];
    $data = file_get_contents($bookingsFile);
    return json_decode($data, true) ?: [];
}

function saveBookings($bookings) {
    global $bookingsFile;
    file_put_contents($bookingsFile, json_encode($bookings, JSON_PRETTY_PRINT));
}

function generateRef() {
    return bin2hex(random_bytes(12));
}

// Handle AJAX booking creation
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['action'])) {
    header('Content-Type: application/json');

    if ($_POST['action'] === 'create') {
        $phone = preg_replace('/\D/', '', $_POST['phone'] ?? '');
        $aadhaarFull = preg_replace('/\D/', '', $_POST['aadhaar'] ?? '');
        $date = $_POST['date'] ?? '';

        if (strlen($phone) !== 10 || strlen($aadhaarFull) !== 12 || !$date) {
            echo json_encode(['error' => 'Invalid input']);
            exit;
        }

        $bookings = loadBookings();

        foreach ($bookings as $b) {
            if ($b['phone'] === $phone && in_array($b['status'], ['pending', 'approved'])) {
                echo json_encode(['error' => 'You already have an active booking (Token #' . $b['token'] . ').']);
                exit;
            }
        }

        $maxToken = 0;
        foreach ($bookings as $b) {
            $t = intval($b['token']);
            if ($t > $maxToken) $maxToken = $t;
        }
        $token = str_pad($maxToken + 1, 2, '0', STR_PAD_LEFT);
        $ref = generateRef();
        $bookingId = 'DS' . date('ymd') . strtoupper(substr($ref, 0, 6));
        $createdAt = date('c');

        $booking = [
            'ref' => $ref,
            'token' => $token,
            'bookingId' => $bookingId,
            'phone' => $phone,
            'aadhaarFull' => $aadhaarFull,
            'aadhaarLast4' => substr($aadhaarFull, -4),
            'service' => 'Aadhaar Update',
            'date' => $date,
            'status' => 'approved',
            'createdAt' => $createdAt,
        ];

        $bookings[] = $booking;
        saveBookings($bookings);

        echo json_encode(['ref' => $ref, 'token' => $token, 'bookingId' => $bookingId, 'date' => $date]);
        exit;
    }

    if ($_POST['action'] === 'get_dates') {
        $dates = [];
        $now = new DateTime();
        $targetDays = [2, 5]; // Tuesday, Friday
        for ($i = 1; $i <= 7; $i++) {
            $d = clone $now;
            $d->modify("+$i days");
            if (in_array((int)$d->format('w'), $targetDays)) {
                $dates[] = [
                    'date' => $d->format('Y-m-d'),
                    'enabled' => true,
                ];
            }
        }
        echo json_encode($dates);
        exit;
    }

    echo json_encode(['error' => 'Unknown action']);
    exit;
}

// Check for booking ref in URL
$booking = null;
if (isset($_GET['ref'])) {
    $ref = preg_replace('/[^a-f0-9]/', '', $_GET['ref']);
    $bookings = loadBookings();
    foreach ($bookings as $b) {
        if ($b['ref'] === $ref) {
            $booking = $b;
            break;
        }
    }
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Aadhaar Update Booking — India Mobile</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="styles.css">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
<script src="db-sync.js"></script>
<style>
.portal-nav {
  background: rgba(8,12,20,0.95);
  backdrop-filter: blur(20px);
  border-bottom: 1px solid var(--glass-border);
  padding: 16px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  position: sticky;
  top: 0;
  z-index: 100;
}
.portal-nav-left { display: flex; align-items: center; gap: 12px; }
.portal-lock { font-size: 20px; }
.portal-body {
  max-width: 600px;
  margin: 0 auto;
  padding: 48px 24px;
}
.portal-header {
  text-align: center;
  margin-bottom: 40px;
}
.portal-header .icon {
  width: 64px; height: 64px;
  background: linear-gradient(135deg, rgba(59,130,246,0.15), rgba(139,92,246,0.1));
  border: 1px solid rgba(59,130,246,0.2);
  border-radius: 18px;
  display: flex; align-items: center; justify-content: center;
  font-size: 30px;
  margin: 0 auto 20px;
}
.portal-header h1 {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 28px;
  font-weight: 700;
  margin-bottom: 8px;
}
.portal-header p { color: var(--text2); font-size: 15px; }

/* Aadhaar input grouping */
.aadhaar-group-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(255,255,255,0.03);
  border: 1px solid var(--glass-border);
  border-radius: 10px;
  padding: 8px 16px;
  transition: border-color 0.2s;
}
.aadhaar-group-wrap:focus-within {
  border-color: rgba(59,130,246,0.5);
  background: rgba(59,130,246,0.04);
}
.aadhaar-group {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
}
.aadhaar-group input {
  width: 0;
  flex: 1;
  min-width: 40px;
  background: transparent;
  border: none;
  outline: none;
  color: var(--text);
  font-size: 18px;
  font-family: 'Space Grotesk', sans-serif;
  letter-spacing: 0.15em;
  font-weight: 600;
  text-align: center;
  padding: 6px 2px;
}
.aadhaar-group input::placeholder { color: var(--text3); font-size: 14px; }
.aadhaar-dash {
  color: var(--text3);
  font-size: 18px;
  font-weight: 300;
  user-select: none;
}

.form-card {
  background: linear-gradient(135deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02));
  border: 1px solid var(--glass-border);
  border-radius: 20px;
  padding: 32px;
  margin-bottom: 24px;
}

.back-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--text3);
  text-decoration: none;
  font-size: 14px;
  margin-bottom: 24px;
  transition: color 0.2s;
}
.back-link:hover { color: var(--accent); }

@media (max-width: 480px) {
  .portal-body { padding: 24px 16px; }
  .form-card { padding: 20px; }
  .aadhaar-group input { font-size: 15px; min-width: 30px; }
}
</style>
<script>
let inactivityTimer;
function resetInactivityTimer() {
  clearTimeout(inactivityTimer);
  inactivityTimer = setTimeout(() => { location.reload(); }, 180000);
}
document.addEventListener('mousemove', resetInactivityTimer);
document.addEventListener('keydown', resetInactivityTimer);
document.addEventListener('click', resetInactivityTimer);
document.addEventListener('touchstart', resetInactivityTimer);
resetInactivityTimer();
</script>
</head>
<body>

<nav class="portal-nav">
  <div class="portal-nav-left">
    <a href="index.html" style="display:flex;align-items:center;gap:10px;text-decoration:none;color:inherit;">
      <img src="21585.png" alt="India Mobile" style="height:48px;width:auto;border-radius:6px;">
      <span class="logo-text">India <span>Mobile</span></span>
    </a>
  </div>
  <div style="display:flex;align-items:center;gap:10px;">
    <a href="index.html" class="btn-secondary" style="font-size:13px; padding:8px 16px;"><i class="fas fa-arrow-left" style="font-size:12px;"></i> Back to Home</a>
  </div>
</nav>

<div class="portal-body">

<?php if ($booking): ?>
  <!-- BOOKING VIEW (via anonymous ref) -->
  <div class="form-card">
    <div class="booking-confirm">
      <div style="width:80px;height:80px;margin:0 auto 16px;">
        <svg viewBox="0 0 80 80" style="width:80px;height:80px;">
          <circle cx="40" cy="40" r="36" fill="none" stroke="rgba(16,185,129,0.3)" stroke-width="3"/>
          <circle cx="40" cy="40" r="36" fill="none" stroke="#34d399" stroke-width="3" stroke-dasharray="226" stroke-dashoffset="226" stroke-linecap="round" class="anim-circle"/>
          <path d="M24 42l12 12 22-24" fill="none" stroke="#34d399" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="56" stroke-dashoffset="56" class="anim-check"/>
        </svg>
      </div>
      <h3 style="font-family:'Space Grotesk',sans-serif;font-size:18px;font-weight:700;margin-bottom:4px;">Booking Confirmed</h3>
      <p style="font-size:14px;color:var(--text2);margin-bottom:24px;">Your appointment is booked successfully.</p>
      <div style="text-align:center;margin-bottom:24px;">
        <div style="font-size:12px;color:var(--text3);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.1em;">Token Number</div>
        <div style="font-family:'Space Grotesk',sans-serif;font-size:72px;font-weight:700;color:var(--accent);line-height:1;text-shadow:0 0 30px rgba(56,189,248,0.3);"><?= htmlspecialchars($booking['token']) ?></div>
      </div>
      <div class="booking-id-badge">Booking ID: <?= htmlspecialchars($booking['bookingId']) ?></div>
      <div class="booking-detail-grid">
        <div class="booking-detail-row">
          <span class="booking-detail-key">Service</span>
          <span class="booking-detail-val"><?= htmlspecialchars($booking['service']) ?></span>
        </div>
        <div class="booking-detail-row">
          <span class="booking-detail-key">Aadhaar</span>
          <span class="booking-detail-val" style="font-family:'Space Grotesk',sans-serif;letter-spacing:0.1em;"><?= htmlspecialchars(preg_replace('/(\d{4})/', '$1 ', $booking['aadhaarFull'])) ?></span>
        </div>
        <div class="booking-detail-row">
          <span class="booking-detail-key">Appointment Date</span>
          <?php $bd = new DateTime($booking['date']); ?>
          <span class="booking-detail-val"><?= $bd->format('l, j F Y') ?></span>
        </div>
        <div class="booking-detail-row">
          <span class="booking-detail-key">Status</span>
          <span class="booking-detail-val text-success">Approved</span>
        </div>
      </div>
      <div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.2);border-radius:10px;padding:14px 16px;margin-top:16px;font-size:13px;color:#fbbf24;text-align:left;">
        Please bring your Aadhaar card and supporting documents. Arrive 10 minutes before your token is called.
      </div>
      <p style="font-size:12px;color:var(--text3);text-align:center;margin-top:20px;">Booking ref: <?= htmlspecialchars($booking['ref']) ?></p>
      <div style="display:flex;gap:10px;margin-top:16px;">
        <a href="index.html" class="btn-primary btn-full" style="justify-content:center;text-decoration:none;flex:1;"><i class="fas fa-arrow-left" style="font-size:14px;"></i> Back to Home</a>
        <button onclick="window.print()" class="btn-primary btn-full" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);justify-content:center;flex:1;"><i class="fas fa-print" style="font-size:14px;"></i> Print</button>
      </div>
    </div>
  </div>

<?php else: ?>
  <!-- BOOKING FORM -->
  <div class="portal-header">
    <div class="icon"><i class="fas fa-id-card"></i></div>
    <h1>Aadhaar Update Booking</h1>
    <p>Book your appointment for Aadhaar updates</p>
  </div>

  <!-- Step 1: Details -->
  <div id="portalStep1" class="form-card">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:24px;">
      <span style="width:28px;height:28px;background:linear-gradient(135deg,var(--neon),var(--neon3));border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#fff;"><i class="fas fa-user" style="font-size:13px;"></i></span>
      <span style="font-weight:600;font-size:15px;">Your Details</span>
    </div>

    <div class="form-group">
      <label class="form-label">Mobile Number</label>
      <div style="display:flex;align-items:center;gap:0;background:rgba(255,255,255,0.03);border:1px solid var(--glass-border);border-radius:10px;overflow:hidden;transition:border-color 0.2s;" id="portalPhoneWrap">
        <span style="padding:13px 14px;font-size:14px;color:var(--text);font-family:'Space Grotesk',sans-serif;letter-spacing:0.1em;border-right:1px solid var(--glass-border);background:rgba(255,255,255,0.02);user-select:none;flex-shrink:0;">+91</span>
        <input type="tel" class="form-input" id="portalPhone" placeholder="Enter 10-digit mobile number" maxlength="10" inputmode="numeric"
          style="flex:1;background:transparent;border:none;outline:none;padding:13px 14px;color:var(--text);font-size:14px;font-family:'Space Grotesk',sans-serif;letter-spacing:0.15em;font-weight:600;"
          onfocus="document.getElementById('portalPhoneWrap').style.borderColor='rgba(59,130,246,0.5)'"
          onblur="document.getElementById('portalPhoneWrap').style.borderColor='var(--glass-border)'">
      </div>
    </div>

    <div class="form-group">
      <label class="form-label">Aadhaar Number</label>
      <div class="aadhaar-group-wrap">
        <div class="aadhaar-group">
          <input type="text" id="aad1" maxlength="4" placeholder="XXXX" inputmode="numeric">
          <span class="aadhaar-dash">-</span>
          <input type="text" id="aad2" maxlength="4" placeholder="XXXX" inputmode="numeric">
          <span class="aadhaar-dash">-</span>
          <input type="text" id="aad3" maxlength="4" placeholder="XXXX" inputmode="numeric">
        </div>
      </div>
      <p style="font-size:12px;color:var(--text3);margin-top:6px;">Enter your 12-digit Aadhaar number as shown on your card</p>
    </div>

    <div id="portalOTPSection" style="display:none;">
      <div style="height:1px;background:var(--glass-border);margin:4px 0 20px;"></div>
      <p style="font-size:13px;color:var(--text3);margin-bottom:16px;">Enter the 6-digit OTP sent to your mobile</p>
      <div class="otp-grid">
        <input type="text" class="otp-input portal-otp" maxlength="1" inputmode="numeric">
        <input type="text" class="otp-input portal-otp" maxlength="1" inputmode="numeric">
        <input type="text" class="otp-input portal-otp" maxlength="1" inputmode="numeric">
        <input type="text" class="otp-input portal-otp" maxlength="1" inputmode="numeric">
        <input type="text" class="otp-input portal-otp" maxlength="1" inputmode="numeric">
        <input type="text" class="otp-input portal-otp" maxlength="1" inputmode="numeric">
      </div>
      <button class="btn-primary btn-full" onclick="verifyPortalOTP()" style="margin-top:12px;">Verify OTP &amp; Continue</button>
      <p style="text-align:center;margin-top:12px;">
        <a href="#" onclick="portalResendOTP(); return false;" style="color:var(--accent);font-size:13px;">Resend OTP</a>
      </p>
    </div>

    <div id="portalSendBtn">
      <button class="btn-primary btn-full" onclick="sendPortalOTP()">Send OTP to Verify</button>
    </div>
  </div>

  <!-- Step 2: Date Selection -->
  <div id="portalStep2" style="display:none;" class="form-card">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:24px;">
      <span style="width:28px;height:28px;background:rgba(16,185,129,0.2);border:1px solid rgba(16,185,129,0.4);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#34d399;"><i class="fas fa-check"></i></span>
      <span style="font-weight:600;font-size:15px;color:var(--text2);">Phone Verified</span>
      <span style="flex:1;height:1px;background:var(--glass-border);"></span>
      <span style="width:28px;height:28px;background:linear-gradient(135deg,var(--neon),var(--neon3));border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#fff;">2</span>
      <span style="font-weight:600;font-size:15px;">Choose Date</span>
    </div>
    <p style="font-size:14px;color:var(--text2);margin-bottom:20px;">Select your preferred appointment date.</p>
    <div class="date-grid" id="portalDateGrid"></div>
    <div style="display:flex;gap:12px;margin-top:24px;">
      <button class="btn-secondary" onclick="portalGoBack()" style="flex:1;justify-content:center;">Back</button>
      <button class="btn-primary" onclick="portalConfirmBooking()" style="flex:2;justify-content:center;">Confirm Booking</button>
    </div>
    <div id="portalSubmitStatus" style="margin-top:12px;text-align:center;font-size:13px;color:var(--text3);display:none;"></div>
  </div>

  <!-- FIND MY BOOKING -->
  <div class="form-card" style="margin-top:16px;border:1px solid rgba(59,130,246,0.15);">
    <div onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'block':'none';this.querySelector('i').classList.toggle('fa-chevron-down');this.querySelector('i').classList.toggle('fa-chevron-up')" style="display:flex;align-items:center;gap:10px;cursor:pointer;user-select:none;">
      <i class="fas fa-chevron-down" style="font-size:12px;color:var(--text3);transition:transform 0.2s;"></i>
      <span style="font-weight:600;font-size:14px;">Already booked? Find your token</span>
    </div>
    <div style="display:none;margin-top:16px;border-top:1px solid var(--glass-border);padding-top:16px;">
      <div style="display:flex;gap:10px;margin-bottom:12px;">
        <div style="flex:1;">
          <label class="form-label" style="font-size:11px;">Search by Phone</label>
          <input type="tel" class="form-input" id="findPhone" placeholder="10-digit mobile" maxlength="10" inputmode="numeric" style="width:100%;padding:10px 12px;background:rgba(255,255,255,0.03);border:1px solid var(--glass-border);border-radius:8px;color:var(--text);font-size:13px;font-family:inherit;outline:none;">
        </div>
        <div style="display:flex;align-items:center;padding-top:22px;color:var(--text3);font-size:12px;">OR</div>
        <div style="flex:1;">
          <label class="form-label" style="font-size:11px;">Search by Aadhaar</label>
          <input type="text" class="form-input" id="findAadhaar" placeholder="12-digit Aadhaar" maxlength="12" inputmode="numeric" style="width:100%;padding:10px 12px;background:rgba(255,255,255,0.03);border:1px solid var(--glass-border);border-radius:8px;color:var(--text);font-size:13px;font-family:inherit;outline:none;">
        </div>
      </div>
      <button class="btn-primary btn-full" onclick="findMyBooking()" style="justify-content:center;font-size:13px;padding:10px;"><i class="fas fa-search" style="font-size:12px;"></i> Find My Booking</button>
      <div id="findResult" style="margin-top:12px;display:none;"></div>
    </div>
  </div>
<?php endif; ?>

</div>

<div id="notif" style="display:none;" class="notification"></div>

<script>
// ============================================
// FRONTEND
// ============================================
let portalPhone = null;
let portalData = {};

function notify(msg, type) {
  const n = document.getElementById('notif');
  n.textContent = msg;
  n.className = 'notification ' + type;
  n.style.display = 'flex';
  clearTimeout(n._t);
  n._t = setTimeout(() => n.style.display = 'none', 3500);
}

async function sendPortalOTPApi(phone) {
  try {
    const res = await fetch('/api/otp?action=send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone })
    });
    return await res.json();
  } catch(e) {
    return { success: false, message: 'Network error' };
  }
}

async function verifyPortalOTPApi(phone, otp) {
  try {
    const res = await fetch('/api/otp?action=verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, otp })
    });
    return await res.json();
  } catch(e) {
    return { success: false, message: 'Network error' };
  }
}

function setupOTPInputs(prefix) {
  document.querySelectorAll('.' + prefix + '-otp').forEach((inp, i, inputs) => {
    inp.addEventListener('input', () => {
      const v = inp.value.replace(/\D/g, '');
      inp.value = v.slice(0, 1);
      if (v && i < inputs.length - 1) inputs[i + 1].focus();
    });
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !inp.value && i > 0) inputs[i - 1].focus();
    });
  });
}

function getOTPValue(prefix) {
  return [...document.querySelectorAll('.' + prefix + '-otp')].map(i => i.value).join('');
}

// Aadhaar auto-grouping
const aadInputs = [document.getElementById('aad1'), document.getElementById('aad2'), document.getElementById('aad3')];
if (aadInputs[0]) {
  aadInputs.forEach((input, i) => {
    input.addEventListener('input', () => {
      let v = input.value.replace(/\D/g, '').slice(0, 4);
      input.value = v;
      if (v.length === 4 && i < 2) aadInputs[i + 1].focus();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !input.value && i > 0) aadInputs[i - 1].focus();
    });
    input.addEventListener('paste', (e) => {
      e.preventDefault();
      const text = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '').slice(0, 12);
      for (let j = 0; j < 3; j++) {
        aadInputs[j].value = text.slice(j * 4, j * 4 + 4) || '';
      }
    });
  });
}

function getFullAadhaar() {
  return aadInputs.map(i => i.value).join('');
}

async function sendPortalOTP() {
  const phone = document.getElementById('portalPhone').value.trim().replace(/\D/g, '');
  if (phone.length !== 10) {
    notify('Please enter a valid 10-digit mobile number', 'error');
    return;
  }

  const aadhaar = getFullAadhaar();
  if (aadhaar.length !== 12) {
    notify('Please enter your complete 12-digit Aadhaar number', 'error');
    return;
  }

  portalPhone = phone;
  portalData = { phone, aadhaarFull: aadhaar, aadhaarLast4: aadhaar.slice(-4), service: 'Aadhaar Update' };

  const result = await sendPortalOTPApi(phone);
  if (result.debug_otp) {
    notify('OTP sent (Demo: ' + result.debug_otp + ')', 'info');
  } else if (result.success) {
    notify('OTP sent to ' + phone, 'success');
  } else {
    notify(result.message || 'Failed to send OTP', 'error');
    return;
  }

  document.getElementById('portalSendBtn').style.display = 'none';
  document.getElementById('portalOTPSection').style.display = 'block';
  setTimeout(() => setupOTPInputs('portal'), 100);
}

async function portalResendOTP() {
  if (portalPhone) {
    const result = await sendPortalOTPApi(portalPhone);
    if (result.debug_otp) {
      notify('OTP resent (Demo: ' + result.debug_otp + ')', 'info');
    } else if (result.success) {
      notify('OTP resent to ' + portalPhone, 'success');
    } else {
      notify(result.message || 'Failed to resend OTP', 'error');
    }
  }
}

async function verifyPortalOTP() {
  const otp = getOTPValue('portal');
  if (otp.length !== 6) { notify('Enter the complete 6-digit OTP', 'error'); return; }
  const btn = document.querySelector('#portalOTPSection .btn-primary');
  if (btn) btn.disabled = true;
  const result = await verifyPortalOTPApi(portalPhone, otp);
  if (btn) btn.disabled = false;
  if (result.success) {
    notify('Phone verified successfully!', 'success');
    showStep2();
  } else {
    notify(result.message || 'Incorrect OTP. Please try again.', 'error');
  }
}

function showStep2() {
  document.getElementById('portalStep1').style.display = 'none';
  document.getElementById('portalStep2').style.display = 'block';

  fetch('aadhaar-portal.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'action=get_dates'
  })
  .then(r => r.json())
  .then(dates => {
    const grid = document.getElementById('portalDateGrid');
    if (!dates || dates.length === 0) {
      grid.innerHTML = '<p style="color:var(--text3);font-size:14px;text-align:center;padding:20px;grid-column:1/-1;">No dates available.</p>';
      return;
    }
    grid.innerHTML = dates.map(d => {
      if (!d.enabled) return '';
      const date = new Date(d.date + 'T00:00:00');
      const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
      const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      return `<div class="date-btn" onclick="portalSelectDate('${d.date}', this)">
        <div class="date-btn-day">${days[date.getDay()]}</div>
        <div class="date-btn-num">${date.getDate()}</div>
        <div class="date-btn-month">${months[date.getMonth()]}</div>
      </div>`;
    }).join('');
  });
}

function portalGoBack() {
  document.getElementById('portalStep2').style.display = 'none';
  document.getElementById('portalStep1').style.display = 'block';
}

let portalSelectedDate = null;

function portalSelectDate(dateStr, el) {
  document.querySelectorAll('.date-btn').forEach(b => b.classList.remove('selected'));
  el.classList.add('selected');
  portalSelectedDate = dateStr;
}

function portalConfirmBooking() {
  if (!portalSelectedDate) {
    notify('Please select an appointment date', 'error');
    return;
  }

  const statusEl = document.getElementById('portalSubmitStatus');
  statusEl.style.display = 'block';
  statusEl.textContent = 'Submitting...';

  const params = new URLSearchParams();
  params.append('action', 'create');
  params.append('phone', portalData.phone);
  params.append('aadhaar', portalData.aadhaarFull);
  params.append('date', portalSelectedDate);

  fetch('aadhaar-portal.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  })
  .then(r => r.json())
  .then(res => {
    if (res.error) {
      statusEl.style.display = 'none';
      notify(res.error, 'error');
      return;
    }
    // Sync to localStorage for real-time dashboard updates
    const bookings = DBSync.getBookings();
    bookings.push({
      token: res.token,
      bookingId: res.bookingId,
      phone: portalData.phone,
      name: 'Portal User',
      aadhaarFull: portalData.aadhaarFull,
      aadhaarLast4: portalData.aadhaarLast4,
      service: 'Aadhaar Update',
      date: res.date,
      status: 'approved',
      createdAt: new Date().toISOString()
    });
    DBSync.setBookings(bookings);
    // Redirect to anonymous booking URL
    window.location.href = 'aadhaar-portal.php?ref=' + res.ref;
  })
  .catch(err => {
    statusEl.style.display = 'none';
    notify('Something went wrong. Please try again.', 'error');
    console.error(err);
  });
}

function findMyBooking() {
  const phone = document.getElementById('findPhone').value.trim().replace(/\D/g, '');
  const aadhaar = document.getElementById('findAadhaar').value.trim().replace(/\D/g, '');
  const resultEl = document.getElementById('findResult');

  if (!phone && !aadhaar) {
    resultEl.style.display = 'block';
    resultEl.innerHTML = '<div style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.2);border-radius:8px;padding:12px;font-size:13px;color:#ef4444;text-align:center;">Enter phone number or Aadhaar number to search.</div>';
    return;
  }

  const bookings = DBSync.getBookings();
  let found = null;

  if (phone && phone.length === 10) {
    found = bookings.find(b => b.phone === phone);
  }
  if (!found && aadhaar && aadhaar.length >= 4) {
    found = bookings.find(b => b.aadhaarFull === aadhaar || b.aadhaarLast4 === aadhaar.slice(-4));
  }

  resultEl.style.display = 'block';

  if (found) {
    const d = new Date(found.date + 'T00:00:00');
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const displayDate = `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
    const statusColor = found.status === 'completed' ? '#22c55e' : found.status === 'processing' ? '#f97316' : found.status === 'cancelled' ? '#ef4444' : '#3b82f6';

    resultEl.innerHTML = `
      <div style="background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.2);border-radius:10px;padding:16px;">
        <div style="text-align:center;margin-bottom:12px;">
          <div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:0.1em;">Your Token Number</div>
          <div style="font-family:'Space Grotesk',sans-serif;font-size:48px;font-weight:700;color:var(--accent);line-height:1.2;text-shadow:0 0 20px rgba(56,189,248,0.2);">${found.token}</div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px;">
          <div style="color:var(--text3);">Booking ID:</div><div style="color:var(--text);font-weight:500;">${found.bookingId || '-'}</div>
          <div style="color:var(--text3);">Date:</div><div style="color:var(--text);font-weight:500;">${displayDate}</div>
          <div style="color:var(--text3);">Status:</div><div style="color:${statusColor};font-weight:600;">${found.status.charAt(0).toUpperCase() + found.status.slice(1)}</div>
          <div style="color:var(--text3);">Phone:</div><div style="color:var(--text);font-weight:500;">${found.phone ? '+91 ' + found.phone.replace(/(\d{5})(\d{5})/, '$1 $2') : '-'}</div>
        </div>
      </div>`;
  } else {
    resultEl.innerHTML = '<div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.2);border-radius:8px;padding:12px;font-size:13px;color:#fbbf24;text-align:center;">No booking found with the given information.</div>';
  }
}
</script>

</body>
</html>
