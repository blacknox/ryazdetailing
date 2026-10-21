// server.js вЂ” С‚РѕС‡РєР° РІС…РѕРґР°. Р—Р°РїСѓСЃРє: node server.js (РёР»Рё npm start).
require('dotenv').config();

// РњРѕРЅРёС‚РѕСЂРёРЅРі РѕС€РёР±РѕРє: РїРѕРґРєР»СЋС‡Р°РµРј РїРµСЂРІС‹Рј, С‡С‚РѕР±С‹ РїРѕР№РјР°С‚СЊ СЃР±РѕРё РїСЂРё СЃС‚Р°СЂС‚Рµ (РІРєР»СЋС‡Р°РµС‚СЃСЏ С‚РѕР»СЊРєРѕ РїСЂРё SENTRY_DSN).
const monitoring = require('./utils/monitoring');
monitoring.init();
monitoring.installProcessHandlers();

const express = require('express');
const cors = require('cors');

const db = require('./db');
const authRoutes = require('./routes/auth');
const bookingRoutes = require('./routes/bookings');
const messageRoutes = require('./routes/messages');
const reviewRoutes = require('./routes/reviews');
const serviceRoutes = require('./routes/services');
const workRoutes = require('./routes/works');
const settingsRoutes = require('./routes/settings');
const adminRoutes = require('./routes/admins');
const blacklistRoutes = require('./routes/blacklist');
const logRoutes = require('./routes/logs');
const systemRoutes = require('./routes/system');

const app = express();

// --- Р‘Р°Р·РѕРІС‹Рµ РЅР°СЃС‚СЂРѕР№РєРё ---
app.disable('x-powered-by');
// Р—Р° Nginx СЂРµР°Р»СЊРЅС‹Р№ IP РєР»РёРµРЅС‚Р° РїСЂРёС…РѕРґРёС‚ РІ X-Forwarded-For. Р‘РµР· СЌС‚РѕРіРѕ rate limit
// РІРёРґРµР» Р±С‹ С‚РѕР»СЊРєРѕ 127.0.0.1 Рё СЃС‡РёС‚Р°Р» РІСЃРµС… РїРѕСЃРµС‚РёС‚РµР»РµР№ РѕРґРЅРёРј С‡РµР»РѕРІРµРєРѕРј.
app.set('trust proxy', 1);
// Р›РёРјРёС‚С‹ С‚РµР»Р° Р·Р°РїСЂРѕСЃР° Р·Р°РІРёСЃСЏС‚ РѕС‚ РјР°СЂС€СЂСѓС‚Р°: РїСѓР±Р»РёС‡РЅС‹Рј С„РѕСЂРјР°Рј С…РІР°С‚Р°РµС‚ 50 РљР‘,
// РѕС‚Р·С‹РІР°Рј РЅСѓР¶РЅРѕ РјРµСЃС‚Рѕ РїРѕРґ Р°РІР°С‚Р°СЂ + 3 С„РѕС‚Рѕ (РїРѕ 2 РњР‘ РІ base64), Р°РґРјРёРЅСЃРєРёРј
// РјР°СЂС€СЂСѓС‚Р°Рј вЂ” РїСЂРµР¶РЅРёРµ 2 РњР‘. РџР°СЂСЃРµСЂ, СЃСЂР°Р±РѕС‚Р°РІС€РёР№ РїРµСЂРІС‹Рј, РІС‚РѕСЂРѕР№ СЂР°Р· РЅРµ РІС‹Р·С‹РІР°РµС‚СЃСЏ.
app.use('/api/reviews', express.json({ limit: '11mb' }));
// РЈСЃР»СѓРіРё Рё СЂР°Р±РѕС‚С‹: С„РѕС‚Рѕ РїСЂРёС…РѕРґСЏС‚ РєР°Рє data:-URI (РґРѕ 2 РњР‘ РЅР° С„Р°Р№Р» в†’ ~2.8 РњР‘ base64; Сѓ СЂР°Р±РѕС‚С‹ РёС… РґРІР°).
app.use(['/api/services', '/api/works'], express.json({ limit: '8mb' }));
app.use(['/api/bookings', '/api/messages', '/api/auth'], express.json({ limit: '50kb' }));
app.use(express.json({ limit: '2mb' }));

// CORS. РЎР°Р№С‚ Рё API РѕР±С‹С‡РЅРѕ РЅР° РѕРґРЅРѕРј РґРѕРјРµРЅРµ (Render РёР»Рё Nginx), Рё С‚РѕРіРґР° CORS РЅРµ
// РЅСѓР¶РµРЅ РІРѕРІСЃРµ: Р·Р°РїСЂРѕСЃС‹ СЃ С‚РѕРіРѕ Р¶Рµ С…РѕСЃС‚Р° РїСЂРѕРїСѓСЃРєР°СЋС‚СЃСЏ РІСЃРµРіРґР°. Р”РѕРїРѕР»РЅРёС‚РµР»СЊРЅС‹Рµ
// РґРѕРјРµРЅС‹ РїРµСЂРµС‡РёСЃР»СЏСЋС‚СЃСЏ РІ FRONTEND_ORIGIN С‡РµСЂРµР· Р·Р°РїСЏС‚СѓСЋ. Р—РЅР°С‡РµРЅРёРµ '*' Рё РїСѓСЃС‚РѕРµ
// Р·РЅР°С‡РµРЅРёРµ РќР• РѕС‚РєСЂС‹РІР°СЋС‚ API РІСЃРµРј вЂ” РїРѕ СѓРјРѕР»С‡Р°РЅРёСЋ РґРѕСЃС‚СѓРї С‚РѕР»СЊРєРѕ СЃРѕ СЃРІРѕРµРіРѕ С…РѕСЃС‚Р°.
const configuredOrigins = String(process.env.FRONTEND_ORIGIN || '')
  .split(',').map((v) => v.trim()).filter((v) => v && v !== '*');
app.use(
  cors((req, callback) => {
    const origin = req.headers.origin;
    let allowed = !origin || configuredOrigins.includes(origin);
    if (!allowed) {
      try { allowed = new URL(origin).host === req.headers.host; } catch { allowed = false; }
    }
    callback(null, {
      origin: allowed ? (origin || false) : false,
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE']
    });
  })
);

// РџСЂРѕСЃС‚С‹Рµ Р·Р°С‰РёС‚РЅС‹Рµ Р·Р°РіРѕР»РѕРІРєРё (Р±РµР· РѕС‚РґРµР»СЊРЅРѕР№ Р·Р°РІРёСЃРёРјРѕСЃС‚Рё helmet).
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // HSTS: Р±РµР·РѕРїР°СЃРЅРѕ РґРѕР±Р°РІР»СЏС‚СЊ РІСЃРµРіРґР° вЂ” Р±СЂР°СѓР·РµСЂ СѓС‡РёС‚С‹РІР°РµС‚ Р·Р°РіРѕР»РѕРІРѕРє С‚РѕР»СЊРєРѕ
  // РїСЂРё Р·Р°С…РѕРґРµ РїРѕ HTTPS, Р° Render РѕС‚РґР°С‘С‚ СЃР°Р№С‚ РїРѕ HTTPS РїРѕ СѓРјРѕР»С‡Р°РЅРёСЋ.
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  // CSP Р±РµР· 'unsafe-inline' РґР»СЏ СЃРєСЂРёРїС‚РѕРІ Рё <style>: РІРµСЃСЊ JS/CSS СЃР°Р№С‚Р° вЂ” РІРЅРµС€РЅРёРµ С„Р°Р№Р»С‹,
  // РѕР±СЂР°Р±РѕС‚С‡РёРєРё СЃРѕР±С‹С‚РёР№ вЂ” С‡РµСЂРµР· js/actions.js (data-Р°С‚СЂРёР±СѓС‚С‹), РїРѕСЌС‚РѕРјСѓ РІРЅРµРґСЂС‘РЅРЅС‹Р№
  // <script> РёР»Рё onclick="..." Р±СЂР°СѓР·РµСЂ РЅРµ РІС‹РїРѕР»РЅРёС‚. style-src-attr 'unsafe-inline' вЂ”
  // С‚РѕР»СЊРєРѕ РґР»СЏ Р°С‚СЂРёР±СѓС‚РѕРІ style="..." (РєРѕРґ РѕРЅРё РІС‹РїРѕР»РЅСЏС‚СЊ РЅРµ РјРѕРіСѓС‚).
  // Р­С‚Р° РїРѕР»РёС‚РёРєР° СЃРёРЅС…СЂРѕРЅРЅР° СЃ deploy/nginx-security-headers.conf: HTML РЅР° VPS СЂР°Р·РґР°С‘С‚ Nginx,
  // Р° Node РѕС‚РґР°С‘С‚ /api Рё /uploads (Рё СЃС‚СЂР°РЅРёС†С‹, РµСЃР»Рё СЃР°Р№С‚ РЅР° Render СЂР°Р·РґР°С‘С‚ СЌС‚РѕС‚ СЃРµСЂРІРµСЂ).
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self'; style-src-attr 'unsafe-inline'; " +
    "img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; media-src 'self' data: blob:; " +
    // frame-src РґР»СЏ РєР°СЂС‚С‹ РЅР° contacts.html (РІРёРґР¶РµС‚ РЇРЅРґРµРєСЃ.РљР°СЂС‚).
    "frame-src https://yandex.ru; " +
    "object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
  );
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), payment=()');
  next();
});

// Р—Р°РіСЂСѓР¶РµРЅРЅС‹Рµ С„РѕС‚Рѕ РѕС‚Р·С‹РІРѕРІ (СЂР°РЅСЊС€Рµ С…СЂР°РЅРёР»РёСЃСЊ РєР°Рє base64 РїСЂСЏРјРѕ РІ Р‘Р”).
// РќР° VPS Nginx С‚РѕР¶Рµ РґРѕР»Р¶РµРЅ РїСЂРѕРєСЃРёСЂРѕРІР°С‚СЊ /uploads/ СЃСЋРґР° вЂ” СЃРј. deploy/nginx-ryazdetailing.conf.
const path = require('path');
// РџР°РїРєР° РґРѕР»Р¶РЅР° СЃСѓС‰РµСЃС‚РІРѕРІР°С‚СЊ СЃ РїРµСЂРІРѕРіРѕ Р·Р°РїСѓСЃРєР° (РЅР° СЃРІРµР¶РµРј СЃРµСЂРІРµСЂРµ РµС‘ РµС‰С‘ РЅРµС‚) вЂ” РёРЅР°С‡Рµ /health/ready РѕС‚РІРµС‚РёР» Р±С‹ 503.
require('fs').mkdirSync(path.join(__dirname, 'uploads'), { recursive: true });
// РРјРµРЅР° С„Р°Р№Р»РѕРІ СѓРЅРёРєР°Р»СЊРЅС‹ (РІСЂРµРјСЏ + UUID) Рё РЅРёРєРѕРіРґР° РЅРµ РїРµСЂРµР·Р°РїРёСЃС‹РІР°СЋС‚СЃСЏ вЂ” РёС… РјРѕР¶РЅРѕ РєСЌС€РёСЂРѕРІР°С‚СЊ РЅР°РґРѕР»РіРѕ.
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), { maxAge: '30d', immutable: true }));

// --- РњР°СЂС€СЂСѓС‚С‹ API ---
app.use('/api/auth', authRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/works', workRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/admins', adminRoutes);
app.use('/api/blacklist', blacklistRoutes);
app.use('/api/logs', logRoutes);
app.use('/api/system', systemRoutes);

// Liveness: В«РїСЂРѕС†РµСЃСЃ Р¶РёРІ Рё РѕС‚РІРµС‡Р°РµС‚В». Р”Р»СЏ Р±Р°Р»Р°РЅСЃРёСЂРѕРІС‰РёРєР° Рё РјРѕРЅРёС‚РѕСЂРёРЅРіР° Р°РїС‚Р°Р№РјР°.
function liveness(req, res) {
  res.json({ ok: true, time: new Date().toISOString() });
}
app.get('/api/health', liveness);
app.get('/health', liveness);

// Readiness: В«РјРѕР¶РЅРѕ СЃР»Р°С‚СЊ С‚СЂР°С„РёРєВ» вЂ” Р‘Р” РѕС‚РІРµС‡Р°РµС‚, РЅР° РґРёСЃРєРµ РµСЃС‚СЊ РјРµСЃС‚Рѕ, uploads РґРѕСЃС‚СѓРїРЅР° РґР»СЏ Р·Р°РїРёСЃРё.
// РќР°СЂСѓР¶Сѓ РѕС‚РґР°С‘Рј С‚РѕР»СЊРєРѕ ok/fail РїРѕ РєР°Р¶РґРѕР№ РїСЂРѕРІРµСЂРєРµ вЂ” Р±РµР· РїСѓС‚РµР№ Рё СЂР°Р·РјРµСЂРѕРІ.
const fs = require('fs');
const MIN_FREE_MB = Number(process.env.HEALTH_MIN_FREE_MB || 200);
function readiness(req, res) {
  const checks = {};
  try { db.prepare('SELECT 1').get(); checks.db = 'ok'; } catch { checks.db = 'fail'; }
  try {
    const st = fs.statfsSync(path.join(__dirname, 'data'));
    checks.disk = (st.bavail * st.bsize) / 1048576 >= MIN_FREE_MB ? 'ok' : 'low';
  } catch { checks.disk = 'unknown'; }
  try { fs.accessSync(path.join(__dirname, 'uploads'), fs.constants.W_OK); checks.uploads = 'ok'; } catch { checks.uploads = 'fail'; }
  const ok = checks.db === 'ok' && checks.disk !== 'low' && checks.uploads === 'ok';
  res.status(ok ? 200 : 503).json({ ok, checks, time: new Date().toISOString() });
}
app.get('/api/health/ready', readiness);
app.get('/health/ready', readiness);

// --- РћР±СЂР°Р±РѕС‚РєР° РѕС€РёР±РѕРє ---
// Sentry-РѕР±СЂР°Р±РѕС‚С‡РёРє (РµСЃР»Рё РІРєР»СЋС‡С‘РЅ) вЂ” РїРѕСЃР»Рµ РІСЃРµС… РјР°СЂС€СЂСѓС‚РѕРІ, РґРѕ РЅР°С€РёС…: РѕРЅ С‚РѕР»СЊРєРѕ СЃРѕРѕР±С‰Р°РµС‚ РѕР± РѕС€РёР±РєР°С… 5xx Рё РїРµСЂРµРґР°С‘С‚ РёС… РґР°Р»СЊС€Рµ.
monitoring.attachExpress(app);

app.use((req, res) => {
  res.status(404).json({ error: 'РќРµ РЅР°Р№РґРµРЅРѕ' });
});

app.use((err, req, res, next) => {
  // РћС€РёР±РєРё СЂР°Р·Р±РѕСЂР° С‚РµР»Р° Р·Р°РїСЂРѕСЃР° вЂ” СЌС‚Рѕ РІРёРЅР° РєР»РёРµРЅС‚Р°, Р° РЅРµ СЃРµСЂРІРµСЂР°.
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'РЎР»РёС€РєРѕРј Р±РѕР»СЊС€РѕР№ Р·Р°РїСЂРѕСЃ' });
  }
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'РќРµРєРѕСЂСЂРµРєС‚РЅС‹Р№ JSON' });
  }
  console.error('[server] РќРµРѕР±СЂР°Р±РѕС‚Р°РЅРЅР°СЏ РѕС€РёР±РєР°:', err);
  res.status(500).json({ error: 'Р’РЅСѓС‚СЂРµРЅРЅСЏСЏ РѕС€РёР±РєР° СЃРµСЂРІРµСЂР°' });
});

const secret = String(process.env.JWT_SECRET || '');
if (secret.length < 32 || /Р·Р°РјРµРЅРёС‚Рµ|changeme/i.test(secret)) {
  throw new Error('JWT_SECRET РЅРµ Р·Р°РґР°РЅ РёР»Рё СЃР»РёС€РєРѕРј РєРѕСЂРѕС‚РєРёР№: РЅСѓР¶РЅР° СЃР»СѓС‡Р°Р№РЅР°СЏ СЃС‚СЂРѕРєР° РѕС‚ 32 СЃРёРјРІРѕР»РѕРІ (СЃРј. .env.example).');
}

require('./utils/startupChecks').assertProductionEnv();

const PORT = process.env.PORT || 3000;
require('./utils/migrateImages').migrateBase64Images();
// РЎС‚СЂР°РЅРёС†С‹ СѓСЃР»СѓРі РґР»СЏ РїРѕРёСЃРєР° (РµСЃР»Рё Р·Р°РґР°РЅ SITE_DIR) вЂ” СЃРёРЅС…СЂРѕРЅРёР·РёСЂСѓРµРј РїСЂРё СЃС‚Р°СЂС‚Рµ.
try { const r = require('./utils/seoBuild').buildSeo(); if (r) console.log(`[seo] СЃС‚СЂР°РЅРёС†С‹ СѓСЃР»СѓРі: ${r.generated.length}`); } catch (e) { console.error('[seo] СЃР±РѕСЂРєР° РїСЂРё СЃС‚Р°СЂС‚Рµ РЅРµ СѓРґР°Р»Р°СЃСЊ:', e.message); }

require('./utils/retention').startRetentionSchedule(require('./db'));

app.listen(PORT, () => {
  console.log(`[server] Р СЏР·Р”РµС‚РµР№Р»РёРЅРі API Р·Р°РїСѓС‰РµРЅ РЅР° РїРѕСЂС‚Сѓ ${PORT}`);
});








