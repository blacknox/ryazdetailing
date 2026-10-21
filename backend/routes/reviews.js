// routes/reviews.js — отзывы: публичный список/отправка + модерация в админке.
const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { notifyTelegram } = require('../telegram');
const { saveImageOptimized, deleteStoredImage } = require('../utils/imageStore');
const { addLog, diffFields } = require('../utils/logs');
const { escTg } = require('../utils/validate');
const { validateStars, validateReviewText } = require('../validators/review');

const router = express.Router();

const MAT_WORDS = ['блядь','бляд','сука','пизд','ёбан','хуй','хуе','хуи','хуя','мудак','залупа','ебат','ебал','шлюх','блять','пидор','гандон','уёб','уеб','нахуй','похуй','заебал','охуел'];
function hasProfanity(s) {
  const t = String(s || '').toLowerCase().replace(/ё/g, 'е');
  return MAT_WORDS.some((w) => t.includes(w));
}

const reviewLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много отзывов подряд. Попробуйте позже.' },
});

function rowToReview(r) {
  return {
    id: r.id,
    name: r.name,
    stars: r.stars,
    rating: r.stars,
    svc: r.svc,
    tag: r.svc,
    text: r.text,
    date: r.date,
    avatar: r.avatar,
    photos: r.photos ? JSON.parse(r.photos) : [],
    status: r.status,
    created: r.created_at,
  };
}

// --- GET /api/reviews — публичный список (только опубликованные) ---
router.get('/', (req, res) => {
  const rows = db
    .prepare(`SELECT * FROM reviews WHERE status = 'published' ORDER BY id DESC`)
    .all();
  res.json({ reviews: rows.map(rowToReview) });
});

// --- GET /api/reviews/admin — все отзывы, для модерации ---
router.get('/admin', requireAuth, (req, res) => {
  const rows = db.prepare(`SELECT * FROM reviews ORDER BY id DESC`).all();
  res.json({ reviews: rows.map(rowToReview) });
});

// --- POST /api/reviews — отправка отзыва с сайта (публично) ---
// Попадает на модерацию (status='new') и не публикуется автоматически.
router.post('/', reviewLimiter, async (req, res) => {
  const { name, stars, svc, text, avatar, photos } = req.body || {};

  if (!name || String(name).trim().length < 2) {
    return res.status(400).json({ error: 'Введите имя' });
  }
  if (hasProfanity(name)) {
    return res.status(400).json({ error: 'Имя содержит недопустимые слова' });
  }
  const starsRes = validateStars(stars);
  if (starsRes.error) return res.status(400).json({ error: 'Укажите оценку от 1 до 5' });
  const starsNum = starsRes.value;
  if (!text || String(text).trim().length < 3) {
    return res.status(400).json({ error: 'Напишите текст отзыва' });
  }
  if (hasProfanity(text)) {
    return res.status(400).json({ error: 'Отзыв содержит недопустимые слова' });
  }

  // Лимиты длины проверяем ДО сохранения файлов, чтобы отклонённый отзыв
  // не оставлял на диске «осиротевших» фото.
  if (String(name).length > 80 || String(text).length > 3000 || String(Array.isArray(svc) ? svc.join(', ') : (svc || '')).length > 300) {
    return res.status(400).json({ error: 'Слишком длинное имя, текст или список услуг' });
  }

  // Фото и аватар приходят как data:-URI (base64) в теле запроса — сохраняем
  // их файлами в uploads/reviews/ и в базу пишем только путь, а не сами байты.
  // Раньше тут base64-строки уходили прямо в колонки БД (avatar/photos) —
  // это раздувало базу и делало её бэкапы в разы тяжелее, чем нужно.
  const avatarPath = avatar ? await saveImageOptimized(avatar, 'reviews') : null;
  const photosIn = (Array.isArray(photos) ? photos.slice(0, 3) : []).filter(Boolean);
  // По одному, а не параллельно: публичный маршрут, обработка картинок тяжёлая — не даём одному запросу занять всю память.
  const photosArr = [];
  for (const p of photosIn) {
    const saved = await saveImageOptimized(p, 'reviews');
    if (saved) photosArr.push(saved);
  }
  // Фото, которые не прошли проверку (слишком большое, не картинка), отбрасываются,
  // а сам отзыв принимается — сообщаем клиенту, сколько фото не загрузилось.
  const photosDropped = (photosIn.length - photosArr.length) + (avatar && !avatarPath ? 1 : 0);
  const svcText = Array.isArray(svc) ? svc.join(', ') : (svc || null);
  const dateText = new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });

  const info = db
    .prepare(
      `INSERT INTO reviews (name, stars, svc, text, date, avatar, photos, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'new')`
    )
    .run(
      String(name).trim(),
      starsNum,
      svcText,
      String(text).trim(),
      dateText,
      avatarPath,
      JSON.stringify(photosArr)
    );

  notifyTelegram(
    `⭐ <b>Новый отзыв на модерацию</b>\nИмя: ${escTg(name)}\nОценка: ${starsNum}/5\n${svcText ? 'Услуга: ' + escTg(svcText) + '\n' : ''}Текст: ${escTg(text)}`
  ).catch(() => {});

  res.status(201).json({ ok: true, id: info.lastInsertRowid, photosDropped });
});

// --- POST /api/reviews/manual (админ) — добавить отзыв вручную ---
router.post('/manual', requireAuth, (req, res) => {
  const { name, stars, svc, text, date, status } = req.body || {};
  const vt = validateReviewText({ name, text, svc, date });
  if (vt.error) return res.status(400).json({ error: vt.error });
  const starsRes = validateStars(stars === undefined || stars === null || stars === '' ? 5 : stars);
  if (starsRes.error) return res.status(400).json({ error: starsRes.error });
  if (status && !['new', 'published', 'hidden'].includes(status)) {
    return res.status(400).json({ error: 'Некорректный статус' });
  }
  const starsNum = starsRes.value;
  const dateText = vt.values.date || new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });

  const info = db
    .prepare(
      `INSERT INTO reviews (name, stars, svc, text, date, status)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(vt.values.name, starsNum, vt.values.svc, vt.values.text, dateText, status || 'published');

  const row = db.prepare('SELECT * FROM reviews WHERE id = ?').get(info.lastInsertRowid);
  addLog(req.admin, 'Добавлен отзыв', row.id, row.name);
  res.status(201).json({ ok: true, review: rowToReview(row) });
});

// --- PATCH /api/reviews/:id (админ) — модерация / редактирование ---
router.patch('/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  const { status, name, stars, svc, text, date } = req.body || {};

  const existing = db.prepare('SELECT * FROM reviews WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Отзыв не найден' });

  const allowedStatus = ['new', 'published', 'hidden'];
  if (status && !allowedStatus.includes(status)) {
    return res.status(400).json({ error: 'Некорректный статус' });
  }
  const vt = validateReviewText({ name, text, svc, date }, { partial: true });
  if (vt.error) return res.status(400).json({ error: vt.error });
  let starsPatch = null;
  if (stars !== undefined && stars !== null && stars !== '') {
    const sr = validateStars(stars);
    if (sr.error) return res.status(400).json({ error: sr.error });
    starsPatch = sr.value;
  }

  db.prepare(
    `UPDATE reviews SET
       status = COALESCE(?, status),
       name = COALESCE(?, name),
       stars = COALESCE(?, stars),
       svc = COALESCE(?, svc),
       text = COALESCE(?, text),
       date = COALESCE(?, date)
     WHERE id = ?`
  ).run(status || null, vt.values.name || null, starsPatch, vt.values.svc || null, vt.values.text || null, vt.values.date || null, id);

  const updated = db.prepare('SELECT * FROM reviews WHERE id = ?').get(id);
  const statusChanged = status && status !== existing.status;
  addLog(
    req.admin,
    statusChanged ? 'Изменён статус отзыва' : 'Изменён отзыв',
    id,
    updated.name,
    diffFields(existing, updated, ['status', 'stars', 'name', 'svc', 'text', 'date'])
  );
  res.json({ ok: true, review: rowToReview(updated) });
});

// --- DELETE /api/reviews/:id (админ) ---
router.delete('/:id', requireAuth, requireRole('admin'), (req, res) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM reviews WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Отзыв не найден' });

  db.prepare('DELETE FROM reviews WHERE id = ?').run(id);

  // Чистим файлы с диска вместе с записью в БД — иначе они останутся висеть
  // в uploads/reviews/ навсегда («осиротевшие» файлы).
  if (existing.avatar) deleteStoredImage(existing.avatar);
  if (existing.photos) {
    try { JSON.parse(existing.photos).forEach(deleteStoredImage); } catch {}
  }

  addLog(req.admin, 'Удалён отзыв', id, existing.name, diffFields(existing, {}, ['name', 'stars', 'status', 'text']));
  res.json({ ok: true });
});

module.exports = router;
