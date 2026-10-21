// server.js — точка входа. Запуск: node server.js (или npm start).
require('dotenv').config();

// Мониторинг ошибок: подключаем первым, чтобы поймать сбои при старте (включается только при SENTRY_DSN).
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

// --- Базовые настройки ---
app.disable('x-powered-by');
// За Nginx реальный IP клиента приходит в X-Forwarded-For. Без этого rate limit
// видел бы только 127.0.0.1 и считал всех посетителей одним человеком.
app.set('trust proxy', 1);
// Лимиты тела запроса зависят от маршрута: публичным формам хватает 50 КБ,
// отзывам нужно место под аватар + 3 фото (по 2 МБ в base64), админским
// маршрутам — прежние 2 МБ. Парсер, сработавший первым, второй раз не вызывается.
app.use('/api/reviews', express.json({ limit: '11mb' }));
// Услуги и работы: фото приходят как data:-URI (до 2 МБ на файл → ~2.8 МБ base64; у работы их два).
app.use(['/api/services', '/api/works'], express.json({ limit: '8mb' }));
app.use(['/api/bookings', '/api/messages', '/api/auth'], express.json({ limit: '50kb' }));
app.use(express.json({ limit: '2mb' }));

// CORS. Сайт и API обычно на одном домене (Render или Nginx), и тогда CORS не
// нужен вовсе: запросы с того же хоста пропускаются всегда. Дополнительные
// домены перечисляются в FRONTEND_ORIGIN через запятую. Значение '*' и пустое
// значение НЕ открывают API всем — по умолчанию доступ только со своего хоста.
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
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
    });
  })
);

// Простые защитные заголовки (без отдельной зависимости helmet).
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // HSTS: безопасно добавлять всегда — браузер учитывает заголовок только
  // при заходе по HTTPS, а Render отдаёт сайт по HTTPS по умолчанию.
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  // CSP без 'unsafe-inline' для скриптов и <style>: весь JS/CSS сайта — внешние файлы,
  // обработчики событий — через js/actions.js (data-атрибуты), поэтому внедрённый
  // <script> или onclick="..." браузер не выполнит. style-src-attr 'unsafe-inline' —
  // только для атрибутов style="..." (код они выполнять не могут).
  // Эта политика синхронна с deploy/nginx-security-headers.conf: HTML на VPS раздаёт Nginx,
  // а Node отдаёт /api и /uploads (и страницы, если сайт на Render раздаёт этот сервер).
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self'; style-src-attr 'unsafe-inline'; " +
    "img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; media-src 'self' data: blob:; " +
    // frame-src для карты на contacts.html (виджет Яндекс.Карт).
    "frame-src https://yandex.ru; " +
    "object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
  );
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), payment=()');
  next();
});

// Загруженные фото отзывов (раньше хранились как base64 прямо в БД).
// На VPS Nginx тоже должен проксировать /uploads/ сюда — см. deploy/nginx-ryazdetailing.conf.
const path = require('path');
// Папка должна существовать с первого запуска (на свежем сервере её ещё нет) — иначе /health/ready ответил бы 503.
require('fs').mkdirSync(path.join(__dirname, 'uploads'), { recursive: true });
// Имена файлов уникальны (время + UUID) и никогда не перезаписываются — их можно кэшировать надолго.
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), { maxAge: '30d', immutable: true }));

// --- Маршруты API ---
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

// Liveness: «процесс жив и отвечает». Для балансировщика и мониторинга аптайма.
function liveness(req, res) {
  res.json({ ok: true, time: new Date().toISOString() });
}
app.get('/api/health', liveness);
app.get('/health', liveness);

// Readiness: «можно слать трафик» — БД отвечает, на диске есть место, uploads доступна для записи.
// Наружу отдаём только ok/fail по каждой проверке — без путей и размеров.
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

// --- Обработка ошибок ---
// Sentry-обработчик (если включён) — после всех маршрутов, до наших: он только сообщает об ошибках 5xx и передаёт их дальше.
monitoring.attachExpress(app);

app.use((req, res) => {
  res.status(404).json({ error: 'Не найдено' });
});

app.use((err, req, res, next) => {
  // Ошибки разбора тела запроса — это вина клиента, а не сервера.
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Слишком большой запрос' });
  }
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Некорректный JSON' });
  }
  console.error('[server] Необработанная ошибка:', err);
  res.status(500).json({ error: 'Внутренняя ошибка сервера' });
});

const secret = String(process.env.JWT_SECRET || '');
if (secret.length < 32 || /замените|changeme/i.test(secret)) {
  throw new Error('JWT_SECRET не задан или слишком короткий: нужна случайная строка от 32 символов (см. .env.example).');
}

require('./utils/startupChecks').assertProductionEnv();

const PORT = process.env.PORT || 3000;
require('./utils/migrateImages').migrateBase64Images();
// Страницы услуг для поиска (если задан SITE_DIR) — синхронизируем при старте.
try { const r = require('./utils/seoBuild').buildSeo(); if (r) console.log(`[seo] страницы услуг: ${r.generated.length}`); } catch (e) { console.error('[seo] сборка при старте не удалась:', e.message); }

require('./utils/retention').startRetentionSchedule(require('./db'));

app.listen(PORT, () => {
  console.log(`[server] РязДетейлинг API запущен на порту ${PORT}`);
});
