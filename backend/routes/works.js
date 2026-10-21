// routes/works.js — «Наши работы» (галерея до/после): публичный список + управление.
const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { addLog, diffFields } = require('../utils/logs');
const { deleteStoredImage } = require('../utils/imageStore');
const { validateWork } = require('../validators/work');
const { resolveImage } = require('../validators/images');

const router = express.Router();

function rowToWork(w) {
  return {
    id: w.id,
    name: w.name,
    cat: w.cat,
    time: w.time,
    before: w.before_photo,
    after: w.after_photo,
    desc: w.desc,
    active: !!w.active,
  };
}

// --- GET /api/works — публичный список (только активные) ---
router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM works WHERE active = 1 ORDER BY id DESC').all();
  res.json({ works: rows.map(rowToWork) });
});

// --- GET /api/works/admin — все работы, включая скрытые ---
router.get('/admin', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM works ORDER BY id DESC').all();
  res.json({ works: rows.map(rowToWork) });
});

// --- POST /api/works (админ) — добавить новую работу ---
router.post('/', requireAuth, async (req, res) => {
  const v = validateWork(req.body, { partial: false });
  if (v.error) return res.status(400).json({ error: v.error });
  const body = req.body || {};
  const before = await resolveImage(body.before, 'works', 'Фото «до»');
  if (before.error) return res.status(400).json({ error: before.error });
  const after = await resolveImage(body.after, 'works', 'Фото «после»');
  if (after.error) { deleteStoredImage(before.created); return res.status(400).json({ error: after.error }); }
  const { name, cat, time, desc } = v.values;

  let info;
  try {
    info = db
      .prepare(
        `INSERT INTO works (name, cat, time, before_photo, after_photo, desc, active)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(name, cat || null, time || null, before.value, after.value, desc || null, body.active === false ? 0 : 1);
  } catch (err) {
    deleteStoredImage(before.created);
    deleteStoredImage(after.created);
    throw err;
  }
  const row = db.prepare('SELECT * FROM works WHERE id = ?').get(info.lastInsertRowid);
  addLog(req.admin, 'Добавлена работа', row.id, row.name);
  res.status(201).json({ ok: true, work: rowToWork(row) });
});

// --- PATCH /api/works/:id (админ) ---
router.patch('/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM works WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Работа не найдена' });

  const v = validateWork(req.body, { partial: true });
  if (v.error) return res.status(400).json({ error: v.error });
  const body = req.body || {};
  const beforeSent = body.before !== undefined;
  const afterSent = body.after !== undefined;
  const before = beforeSent ? await resolveImage(body.before, 'works', 'Фото «до»') : { value: null, created: null };
  if (before.error) return res.status(400).json({ error: before.error });
  const after = afterSent ? await resolveImage(body.after, 'works', 'Фото «после»') : { value: null, created: null };
  if (after.error) { deleteStoredImage(before.created); return res.status(400).json({ error: after.error }); }
  const f = v.values;

  db.prepare(
    `UPDATE works SET
       name = COALESCE(?, name),
       cat = COALESCE(?, cat),
       time = COALESCE(?, time),
       before_photo = CASE WHEN ? = 1 THEN ? ELSE before_photo END,
       after_photo = CASE WHEN ? = 1 THEN ? ELSE after_photo END,
       desc = COALESCE(?, desc),
       active = COALESCE(?, active)
     WHERE id = ?`
  ).run(
    f.name !== undefined ? f.name : null,
    f.cat !== undefined ? f.cat : null,
    f.time !== undefined ? f.time : null,
    beforeSent ? 1 : 0, before.value,
    afterSent ? 1 : 0, after.value,
    f.desc !== undefined ? f.desc : null,
    body.active !== undefined ? (body.active ? 1 : 0) : null,
    id
  );

  if (beforeSent && existing.before_photo && existing.before_photo !== before.value) deleteStoredImage(existing.before_photo);
  if (afterSent && existing.after_photo && existing.after_photo !== after.value) deleteStoredImage(existing.after_photo);

  const updated = db.prepare('SELECT * FROM works WHERE id = ?').get(id);
  addLog(req.admin, 'Изменена работа', id, updated.name, diffFields(existing, updated, ['name', 'cat', 'time', 'desc', 'active', 'before_photo', 'after_photo']));
  res.json({ ok: true, work: rowToWork(updated) });
});

// --- DELETE /api/works/:id (админ) ---
router.delete('/:id', requireAuth, requireRole('admin'), (req, res) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM works WHERE id = ?').get(id);
  const info = db.prepare('DELETE FROM works WHERE id = ?').run(id);
  if (info.changes === 0) return res.status(404).json({ error: 'Работа не найдена' });
  if (existing) {
    deleteStoredImage(existing.before_photo);
    deleteStoredImage(existing.after_photo);
  }
  addLog(req.admin, 'Удалена работа', id, existing ? existing.name : '', existing ? diffFields(existing, {}, ['name', 'cat', 'time', 'active']) : null);
  res.json({ ok: true });
});

module.exports = router;
