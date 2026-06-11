const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const ROOT = __dirname;
const BOOKINGS_FILE = path.join(ROOT, 'bookings.json');
const GOOGLE_CLIENT_ID = '1038149618074-ita1e96k5qa69fot2qmdua4mtp3gjitf.apps.googleusercontent.com';

let updatesCache = null;
let cacheTimestamp = 0;
const CACHE_LIFETIME = 5 * 60 * 1000;

function loadBookings() {
  try {
    if (fs.existsSync(BOOKINGS_FILE)) {
      const raw = fs.readFileSync(BOOKINGS_FILE, 'utf-8');
      return JSON.parse(raw);
    }
  } catch { }
  return [];
}

function saveBookings(bookings) {
  fs.writeFileSync(BOOKINGS_FILE, JSON.stringify(bookings, null, 2), 'utf-8');
}

if (!fs.existsSync(BOOKINGS_FILE)) {
  saveBookings([]);
}

function generateBookingId() {
  const n = Math.floor(Math.random() * 90000) + 10000;
  return 'DS-' + n;
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try { resolve(JSON.parse(body)); }
      catch { reject(new Error('Invalid JSON')); }
    });
  });
}

function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  });
  res.end(JSON.stringify(data));
}

async function handleBookAppointment(req, res) {
  try {
    const body = await parseJsonBody(req);
    const { name, phone, service, date, time, note } = body;
    const cleanPhone = (phone || '').replace(/\D/g, '');

    if (!name || !name.trim()) return sendJson(res, 400, { success: false, message: 'Name is required.' });
    if (!/^[6-9]\d{9}$/.test(cleanPhone)) return sendJson(res, 400, { success: false, message: 'Valid 10-digit Indian mobile number required.' });
    if (!service) return sendJson(res, 400, { success: false, message: 'Service type is required.' });
    if (!date) return sendJson(res, 400, { success: false, message: 'Date is required.' });
    if (!time) return sendJson(res, 400, { success: false, message: 'Time slot is required.' });

    const existing = loadBookings().find(b => b.phone === cleanPhone && b.service === service && b.date === date && b.time === time);
    if (existing) return sendJson(res, 200, { success: false, message: 'DUPLICATE_BOOKING', existingBooking: { id: existing.id, service: existing.service, date: existing.date, time: existing.time } });

    const id = generateBookingId();
    const booking = {
      id,
      name: name.trim(),
      phone: cleanPhone,
      service,
      date,
      time,
      note: (note || '').trim(),
      status: 'Pending',
      createdAt: new Date().toISOString()
    };

    const bookings = loadBookings();
    bookings.unshift(booking);
    saveBookings(bookings);

    sendJson(res, 200, {
      success: true,
      message: 'Appointment booked successfully!',
      booking
    });
  } catch (err) {
    sendJson(res, 400, { success: false, message: 'Invalid request.' });
  }
}

function handleGetBookings(req, res) {
  const bookings = loadBookings();
  sendJson(res, 200, { success: true, bookings });
}

function handleGetBooking(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const id = url.searchParams.get('id');
  if (!id) return sendJson(res, 400, { success: false, message: 'Booking ID required.' });
  const bookings = loadBookings();
  const booking = bookings.find(b => b.id === id);
  if (!booking) return sendJson(res, 404, { success: false, message: 'Booking not found.' });
  sendJson(res, 200, { success: true, booking });
}

async function handleUpdateBooking(req, res) {
  try {
    const body = await parseJsonBody(req);
    const { action, id, status } = body;
    let bookings = loadBookings();

    if (action === 'updateStatus' && id && status) {
      const idx = bookings.findIndex(b => b.id === id);
      if (idx === -1) return sendJson(res, 404, { success: false, message: 'Booking not found.' });
      bookings[idx].status = status;
      saveBookings(bookings);
      return sendJson(res, 200, { success: true, message: 'Status updated.' });
    }

    if (action === 'delete' && id) {
      bookings = bookings.filter(b => b.id !== id);
      saveBookings(bookings);
      return sendJson(res, 200, { success: true, message: 'Booking deleted.' });
    }

    if (action === 'clear') {
      saveBookings([]);
      return sendJson(res, 200, { success: true, message: 'All bookings cleared.' });
    }

    sendJson(res, 400, { success: false, message: 'Invalid action.' });
  } catch {
    sendJson(res, 400, { success: false, message: 'Invalid request.' });
  }
}

async function handleGoogleAuth(req, res) {
  try {
    const body = await parseJsonBody(req);
    const { credential } = body;

    if (!credential) {
      return sendJson(res, 400, { success: false, message: 'Credential required.' });
    }

    if (!GOOGLE_CLIENT_ID) {
      return sendJson(res, 400, { success: false, message: 'Google Client ID not configured on server. Set GOOGLE_CLIENT_ID in server.js' });
    }

    const resp = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
    const data = await resp.json();

    if (!resp.ok || data.error) {
      return sendJson(res, 401, { success: false, message: 'Invalid token.' });
    }

    if (data.aud !== GOOGLE_CLIENT_ID) {
      return sendJson(res, 401, { success: false, message: 'Token audience mismatch.' });
    }

    if (!data.email) {
      return sendJson(res, 400, { success: false, message: 'Email not provided by Google.' });
    }

    sendJson(res, 200, {
      success: true,
      user: {
        sub: data.sub,
        email: data.email,
        name: data.name || '',
        picture: data.picture || ''
      }
    });
  } catch (err) {
    sendJson(res, 400, { success: false, message: 'Invalid request.' });
  }
}

function decodeHtmlEntities(text) {
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(parseInt(code, 10)))
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/\s+/g, ' ').trim();
}

function cleanTelegramText(html) {
  return html
    .replace(/<i class="emoji[^>]*>[\s\S]*?<\/i>/g, '')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/\*+/g, '').replace(/#\w+/g, '')
    .replace(/\n{2,}/g, '\n').trim();
}

function extractTitle(text) {
  const lines = text.split('\n').filter(l => l.trim());
  for (const line of lines) {
    const cleaned = line.replace(/[✅🔥👇👉🏻⚠️👆🙏]/g, '').trim();
    if (cleaned.length > 15) return cleaned;
  }
  return lines[0] || text;
}

async function fetchTelegramPosts() {
  const resp = await fetch('https://t.me/s/examsarkarijob', {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
  });
  if (!resp.ok) throw new Error('Telegram fetch failed: ' + resp.status);
  const html = await resp.text();
  const allItems = [];
  const msgWraps = html.match(/<div class="tgme_widget_message_wrap[^>]*">[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/g) || [];
  for (const block of msgWraps) {
    const textMatch = block.match(/<div class="tgme_widget_message_text js-message_text[^>]*">([\s\S]*?)<\/div>/);
    const linkMatch = block.match(/<a class="tgme_widget_message_link_preview" href="([^"]+)">/);
    const timeMatch = block.match(/<time datetime="([^"]+)"/);
    if (!textMatch) continue;
    const rawText = textMatch[1];
    const cleaned = cleanTelegramText(rawText);
    const title = extractTitle(cleaned);
    const link = linkMatch ? linkMatch[1] : '#';
    const date = timeMatch ? timeMatch[1] : '';
    if (title && title.length > 10) {
      allItems.push({ title, link, date, raw: rawText.toLowerCase() });
    }
  }
  const latestJobs = [], latestUpdates = [], sarkariYojana = [];
  for (const item of allItems) {
    const t = item.title.toLowerCase() + ' ' + item.raw;
    if (t.includes('yojana') || t.includes('scheme') || t.includes('anudan') || t.includes('योजना')) {
      sarkariYojana.push({ title: item.title, link: item.link });
    } else if (t.includes('vacancy') || t.includes('recruitment') || t.includes('apply online') || t.includes('bharti') || t.includes('भर्ती')) {
      latestJobs.push({ title: item.title, link: item.link });
    } else if (t.includes('admit card') || t.includes('result') || t.includes('exam city') || t.includes('answer key') || t.includes('एडमिट') || t.includes('रिजल्ट')) {
      latestUpdates.push({ title: item.title, link: item.link });
    } else if (t.includes('internship') || t.includes('training') || t.includes('scholarship')) {
      latestUpdates.push({ title: item.title, link: item.link });
    } else {
      if (t.includes('post') || t.includes('apply') || t.includes('eligibility') || t.includes('salary')) {
        latestJobs.push({ title: item.title, link: item.link });
      } else {
        latestUpdates.push({ title: item.title, link: item.link });
      }
    }
  }
  return { latestUpdates, latestJobs, sarkariYojana };
}

function parseRssItems(xml) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let itemMatch;
  while ((itemMatch = itemRegex.exec(xml)) !== null) {
    const block = itemMatch[1];
    const titleMatch = block.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
    const linkMatch = block.match(/<link>([\s\S]*?)<\/link>/i);
    if (titleMatch) {
      items.push({ title: decodeHtmlEntities(titleMatch[1].trim()), link: linkMatch ? linkMatch[1].trim() : '#' });
    }
  }
  return items;
}

async function fetchRss(query) {
  const url = 'https://news.google.com/rss/search?q=' + encodeURIComponent(query) + '&hl=en-IN&gl=IN&ceid=IN:en';
  const resp = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!resp.ok) throw new Error('RSS fetch failed: ' + resp.status);
  return parseRssItems(await resp.text());
}

async function handleApiUpdates(req, res) {
  if (updatesCache && (Date.now() - cacheTimestamp < CACHE_LIFETIME)) {
    return sendJson(res, 200, updatesCache);
  }
  try {
    const [telegramData, rssYojana] = await Promise.allSettled([
      fetchTelegramPosts(),
      fetchRss('sarkari yojana government schemes india 2026')
    ]);
    const data = telegramData.status === 'fulfilled' ? telegramData.value : { latestUpdates: [], latestJobs: [], sarkariYojana: [] };
    if (data.sarkariYojana.length < 3 && rssYojana.status === 'fulfilled') {
      data.sarkariYojana = rssYojana.value.slice(0, 12);
    }
    if (telegramData.status === 'rejected') {
      console.error('Telegram fetch failed:', telegramData.reason);
      if (updatesCache) return sendJson(res, 200, updatesCache);
      if (rssYojana.status === 'rejected' && data.latestUpdates.length === 0) throw new Error('Both Telegram and RSS failed');
    }
    updatesCache = data;
    cacheTimestamp = Date.now();
    sendJson(res, 200, data);
  } catch (error) {
    console.error('Error fetching updates:', error);
    if (updatesCache) return sendJson(res, 200, updatesCache);
    sendJson(res, 500, { error: 'Failed to fetch updates' });
  }
}

const MIME_TYPES = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.webp': 'image/webp',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.pdf': 'application/pdf',
};

function serveStaticFile(urlPath, res) {
  const filePath = path.join(ROOT, urlPath);
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403); res.end('403 Forbidden');
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end(`<html><head><title>404 — Not Found</title></head><body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#060E1A;color:white;text-align:center;"><div><h1 style="font-size:4rem;margin-bottom:10px;">404</h1><p style="color:rgba(255,255,255,0.5);">File not found: ${urlPath}</p><a href="/" style="color:#FF6B00;margin-top:20px;display:inline-block;">← Go to DigiSeva Home</a></div></body></html>`);
      } else {
        res.writeHead(500); res.end('500 Internal Server Error');
      }
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

function handleLookupBooking(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const phone = url.searchParams.get('phone') || '';
  const cleanPhone = phone.replace(/\D/g, '');
  if (!/^[6-9]\d{9}$/.test(cleanPhone)) return sendJson(res, 400, { success: false, message: 'Invalid phone number.' });
  const bookings = loadBookings().filter(b => b.phone === cleanPhone);
  sendJson(res, 200, { success: true, bookings });
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
    });
    res.end();
    return;
  }

  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  const method = req.method;

  if (urlPath === '/api/updates' && method === 'GET') return handleApiUpdates(req, res);
  if (urlPath === '/api/book-appointment' && method === 'POST') return handleBookAppointment(req, res);
  if (urlPath === '/api/bookings' && method === 'GET') return handleGetBookings(req, res);
  if (urlPath === '/api/booking' && method === 'GET') return handleGetBooking(req, res);
  if (urlPath === '/api/bookings' && method === 'POST') return handleUpdateBooking(req, res);
  if (urlPath === '/api/lookup-booking' && method === 'GET') return handleLookupBooking(req, res);
  if (urlPath === '/api/auth/google' && method === 'POST') return handleGoogleAuth(req, res);

  const filePath = urlPath === '/' || urlPath === '' ? '/index.html' : urlPath;
  serveStaticFile(filePath, res);
});

server.listen(PORT, () => {
  console.log('');
  console.log('  ╔══════════════════════════════════════════════════╗');
  console.log('  ║                                                  ║');
  console.log('  ║   💻  DigiSeva Server Running!                   ║');
  console.log('  ║                                                  ║');
  console.log(`  ║   🌐  http://localhost:${PORT}                      ║`);
  console.log('  ║                                                  ║');
  console.log('  ║   Pages:                                         ║');
  console.log(`  ║   • Home        → http://localhost:${PORT}/         ║`);
  console.log(`  ║   • Appointment → http://localhost:${PORT}/appointment.html  ║`);
  console.log(`  ║   • Payment     → http://localhost:${PORT}/payment_gateway.html ║`);
  console.log('  ║                                                  ║');
  console.log('  ║   API:                                           ║');
  console.log('  ║   • POST /api/auth/google                        ║');
  console.log('  ║   • POST /api/book-appointment                   ║');
  console.log('  ║   • GET  /api/bookings                           ║');
  console.log('  ║                                                  ║');
  if (!GOOGLE_CLIENT_ID) {
    console.log('  ║   ⚠️  Google Client ID not set.                   ║');
    console.log('  ║   Set GOOGLE_CLIENT_ID in server.js to enable.  ║');
  }
  console.log('  ║                                                  ║');
  console.log('  ║   Press Ctrl+C to stop                           ║');
  console.log('  ║                                                  ║');
  console.log('  ╚══════════════════════════════════════════════════╝');
  console.log('');
});
