// routes/settings.js — настройки сайта (контакты, тексты страниц,
// политика конфиденциальности): публичное чтение + запись из админки.
const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { addLog, diffFields } = require('../utils/logs');
const { buildHoursText, validateHoursSettings } = require('../utils/hours');

const router = express.Router();

// Разрешённые ключи — чтобы через этот эндпоинт нельзя было создать
// произвольную запись в таблице.
const ALLOWED_KEYS = ['contacts', 'site_content', 'privacy'];

// --- GET /api/settings/:key — публично, отдаёт JSON-значение ---
router.get('/:key', (req, res) => {
  const { key } = req.params;
  if (!ALLOWED_KEYS.includes(key)) {
    return res.status(404).json({ error: 'Неизвестный ключ настроек' });
  }
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  if (!row) return res.json({ key, value: {} });
  res.json({ key, value: JSON.parse(row.value) });
});

// --- PUT /api/settings/:key (админ) — полностью заменяет значение ---
// Контакты/контент сайта/политика конфиденциальности — решения уровня владельца,
// manager эти настройки не редактирует.
router.put('/:key', requireAuth, requireRole('admin'), (req, res) => {
  const { key } = req.params;
  if (!ALLOWED_KEYS.includes(key)) {
    return res.status(404).json({ error: 'Неизвестный ключ настроек' });
  }
  const value = req.body && req.body.value !== undefined ? req.body.value : req.body;
  if (typeof value !== 'object' || value === null) {
    return res.status(400).json({ error: 'Значение должно быть объектом' });
  }

  // Контакты: расписание проверяем и строим из него текст «График работы» —
  // единый источник для сайта, формы записи и проверок на сервере.
  if (key === 'contacts') {
    const hoursError = validateHoursSettings(value);
    if (hoursError) return res.status(400).json({ error: hoursError });
    value.weOff = value.weOff === true;
    value.hours = buildHoursText(value);
  }

  const prevRow = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  let prev = {};
  try { prev = prevRow ? JSON.parse(prevRow.value) : {}; } catch { prev = {}; }

  db.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run(key, JSON.stringify(value));

  const labels = { contacts: 'Контакты сайта', site_content: 'Контент сайта', privacy: 'Политика конфиденциальности' };
  addLog(req.admin, `Изменены настройки: ${labels[key] || key}`, key, null,
    diffFields(prev, value, [...new Set([...Object.keys(prev), ...Object.keys(value)])]));

  res.json({ ok: true, key, value });
});

module.exports = router;
