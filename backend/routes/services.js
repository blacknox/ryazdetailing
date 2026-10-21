// routes/services.js — услуги и цены: публичный список + управление в админке.
const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { addLog, diffFields } = require('../utils/logs');
const { deleteStoredImage } = require('../utils/imageStore');
const { validateService } = require('../validators/service');
const { resolveImage } = require('../validators/images');
const { uniqueSlug } = require('../utils/slug');
const { scheduleSeoBuild, generatedPageUrl } = require('../utils/seoBuild');

const router = express.Router();

function rowToService(s) {
  return {
    id: s.id,
    slug: s.slug,
    pageUrl: generatedPageUrl(s.slug),
    name: s.name,
    price: s.price,
    dur: s.dur,
    desc: s.desc,
    discount: s.discount,
    fullDesc: s.full_desc,
    photo: s.photo,
    active: !!s.active,
  };
}

// --- GET /api/services — публичный список (только активные) ---
router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM services WHERE active = 1 ORDER BY id').all();
  res.json({ services: rows.map(rowToService) });
});

// --- GET /api/services/admin — все услуги, включая скрытые ---
router.get('/admin', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM services ORDER BY id').all();
  res.json({ services: rows.map(rowToService) });
});

// --- POST /api/services (админ) — добавить новую услугу ---
// Добавление/изменение/удаление услуг и цен — решения уровня владельца.
router.post('/', requireAuth, requireRole('admin'), async (req, res) => {
  const v = validateService(req.body, { partial: false });
  if (v.error) return res.status(400).json({ error: v.error });
  const img = await resolveImage((req.body || {}).photo, 'services', 'Фото услуги');
  if (img.error) return res.status(400).json({ error: img.error });
  const { name, price, dur, desc, discount, fullDesc } = v.values;
  const active = (req.body || {}).active;

  let info;
  try {
    info = db
      .prepare(
        `INSERT INTO services (name, price, dur, desc, discount, full_desc, photo, active, slug)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        name, price, dur || null, desc || null, discount || 0, fullDesc || null, img.value, active === false ? 0 : 1,
        uniqueSlug(name, (c) => !!db.prepare('SELECT 1 FROM services WHERE slug = ?').get(c))
      );
  } catch (err) {
    deleteStoredImage(img.created); // не оставляем «осиротевший» файл
    throw err;
  }
  const row = db.prepare('SELECT * FROM services WHERE id = ?').get(info.lastInsertRowid);
  addLog(req.admin, 'Добавлена услуга', row.id, `${row.name}: ${row.price}₽`);
  scheduleSeoBuild();
  res.status(201).json({ ok: true, service: rowToService(row) });
});

// --- PATCH /api/services/:id (админ) — редактировать услугу ---
router.patch('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM services WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Услуга не найдена' });

  const v = validateService(req.body, { partial: true });
  if (v.error) return res.status(400).json({ error: v.error });
  const body = req.body || {};
  const photoSent = body.photo !== undefined;
  let img = { value: null, created: null };
  if (photoSent) {
    img = await resolveImage(body.photo, 'services', 'Фото услуги');
    if (img.error) return res.status(400).json({ error: img.error });
  }
  const f = v.values;

  // photo: '' / null = убрать фото (старое значение в БД перезаписываем пустой строкой).
  db.prepare(
    `UPDATE services SET
       name = COALESCE(?, name),
       price = COALESCE(?, price),
       dur = COALESCE(?, dur),
       desc = COALESCE(?, desc),
       discount = COALESCE(?, discount),
       full_desc = COALESCE(?, full_desc),
       photo = CASE WHEN ? = 1 THEN ? ELSE photo END,
       active = COALESCE(?, active)
     WHERE id = ?`
  ).run(
    f.name !== undefined ? f.name : null,
    f.price !== undefined ? f.price : null,
    f.dur !== undefined ? f.dur : null,
    f.desc !== undefined ? f.desc : null,
    f.discount !== undefined ? f.discount : null,
    f.fullDesc !== undefined ? f.fullDesc : null,
    photoSent ? 1 : 0,
    img.value,
    body.active !== undefined ? (body.active ? 1 : 0) : null,
    id
  );

  // Фото заменили или убрали — старый файл больше не нужен.
  if (photoSent && existing.photo && existing.photo !== img.value) deleteStoredImage(existing.photo);

  const updated = db.prepare('SELECT * FROM services WHERE id = ?').get(id);
  addLog(
    req.admin,
    updated.price !== existing.price ? 'Изменена цена услуги' : 'Изменена услуга',
    id,
    updated.name,
    diffFields(existing, updated, ['name', 'price', 'dur', 'discount', 'active', 'desc', 'full_desc', 'photo'])
  );
  scheduleSeoBuild();
  res.json({ ok: true, service: rowToService(updated) });
});

// --- DELETE /api/services/:id (админ) ---
router.delete('/:id', requireAuth, requireRole('admin'), (req, res) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM services WHERE id = ?').get(id);
  const info = db.prepare('DELETE FROM services WHERE id = ?').run(id);
  if (info.changes === 0) return res.status(404).json({ error: 'Услуга не найдена' });
  if (existing && existing.photo) deleteStoredImage(existing.photo);
  addLog(req.admin, 'Удалена услуга', id, existing ? existing.name : '', existing ? diffFields(existing, {}, ['name', 'price', 'dur', 'discount', 'active']) : null);
  scheduleSeoBuild();
  res.json({ ok: true });
});

module.exports = router;
