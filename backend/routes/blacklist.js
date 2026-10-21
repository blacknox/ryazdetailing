// routes/blacklist.js — чёрный список номеров. Раньше хранился только в
// localStorage админки (не синхронизирован между устройствами/админами и,
// главное, никак не проверялся при создании брони — см. bookings.js).
const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { normalizePhone } = require('../utils/phone');
const { addLog } = require('../utils/logs');

const router = express.Router();

router.use(requireAuth);

// GET /api/blacklist — список заблокированных номеров.
router.get('/', (req, res) => {
  const list = db.prepare('SELECT * FROM blacklist ORDER BY id DESC').all();
  res.json({ blacklist: list });
});

// POST /api/blacklist — добавить номер.
router.post('/', requireRole('admin'), (req, res) => {
  const { phone, reason } = req.body || {};
  const normalized = normalizePhone(phone);

  if (normalized.length !== 10) {
    return res.status(400).json({ error: 'Укажите корректный номер телефона' });
  }

  const exists = db.prepare('SELECT id FROM blacklist WHERE phone_normalized = ?').get(normalized);
  if (exists) {
    return res.status(409).json({ error: 'Этот номер уже в чёрном списке' });
  }

  const result = db
    .prepare('INSERT INTO blacklist (phone, phone_normalized, reason) VALUES (?, ?, ?)')
    .run(String(phone).trim(), normalized, reason ? String(reason).trim() : null);

  const created = db.prepare('SELECT * FROM blacklist WHERE id = ?').get(result.lastInsertRowid);
  addLog(req.admin, 'Добавлен в чёрный список', created.id, created.phone);
  res.status(201).json({ entry: created });
});

// DELETE /api/blacklist/:id — убрать номер из списка.
router.delete('/:id', requireRole('admin'), (req, res) => {
  const existing = db.prepare('SELECT * FROM blacklist WHERE id = ?').get(req.params.id);
  const result = db.prepare('DELETE FROM blacklist WHERE id = ?').run(req.params.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Запись не найдена' });
  }
  addLog(req.admin, 'Убран из чёрного списка', req.params.id, existing ? existing.phone : '');
  res.json({ ok: true });
});

module.exports = router;
