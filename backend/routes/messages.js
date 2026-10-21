// routes/messages.js — форма обратной связи (не онлайн-запись, а просто сообщение).
const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { notifyTelegram } = require('../telegram');
const { addLog } = require('../utils/logs');
const { tooLong, escTg } = require('../utils/validate');

const router = express.Router();

const messageLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много сообщений подряд. Попробуйте позже.' },
});

router.post('/', messageLimiter, (req, res) => {
  const { name, phone, email, text } = req.body || {};

  if (!text || String(text).trim().length < 3) {
    return res.status(400).json({ error: 'Введите текст сообщения' });
  }

  const longField = tooLong({ name, phone, email, text });
  if (longField) {
    return res.status(400).json({ error: 'Слишком длинное значение в поле: ' + longField });
  }

  const info = db
    .prepare('INSERT INTO messages (name, phone, email, text) VALUES (?, ?, ?, ?)')
    .run(
      name ? String(name).trim() : null,
      phone ? String(phone).trim() : null,
      email ? String(email).trim() : null,
      String(text).trim()
    );

  notifyTelegram(
    `✉️ <b>Новое сообщение с сайта</b>\n` +
      `Имя: ${escTg(name || '—')}\n` +
      `Телефон: ${escTg(phone || '—')}\n` +
      `Email: ${escTg(email || '—')}\n` +
      `Текст: ${escTg(text)}`
  ).catch(() => {});

  res.status(201).json({ ok: true, id: info.lastInsertRowid });
});

router.get('/', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM messages ORDER BY created_at DESC').all();
  res.json({ messages: rows });
});

// --- PATCH /api/messages/:id (админ) — смена статуса (new/read/processed) ---
router.patch('/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  const { status } = req.body || {};
  const allowed = ['new', 'read', 'processed'];
  if (!status || !allowed.includes(status)) {
    return res.status(400).json({ error: 'Некорректный статус' });
  }
  const existing = db.prepare('SELECT * FROM messages WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Сообщение не найдено' });

  db.prepare('UPDATE messages SET status = ? WHERE id = ?').run(status, id);
  const updated = db.prepare('SELECT * FROM messages WHERE id = ?').get(id);
  res.json({ ok: true, message: updated });
});

// --- DELETE /api/messages/:id (админ) ---
// Удалять сообщения клиентов может только администратор (менеджер отмечает прочитанным).
router.delete('/:id', requireAuth, requireRole('admin'), (req, res) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM messages WHERE id = ?').get(id);
  const info = db.prepare('DELETE FROM messages WHERE id = ?').run(id);
  if (info.changes === 0) return res.status(404).json({ error: 'Сообщение не найдено' });
  addLog(req.admin, 'Удалено сообщение', id, existing ? existing.name || existing.phone || '' : '');
  res.json({ ok: true });
});

module.exports = router;
