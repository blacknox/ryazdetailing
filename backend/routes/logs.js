// routes/logs.js — просмотр серверного лога действий. Только для роли admin:
// это история работы всей команды, включая самих администраторов — manager
// её не должен ни читать, ни тем более чистить.
const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth, requireRole('admin'));

// GET /api/logs — последние 500 записей, свежие сверху.
router.get('/', (req, res) => {
  const logs = db.prepare('SELECT * FROM logs ORDER BY id DESC LIMIT 500').all().map((l) => {
    let changes = null;
    try { changes = l.changes ? JSON.parse(l.changes) : null; } catch { /* битый JSON не мешает показать остальное */ }
    return { ...l, changes };
  });
  res.json({ logs });
});

// DELETE /api/logs/old — оставить только 50 последних записей (аналог
// прежней клиентской clearOldLogs()).
router.delete('/old', (req, res) => {
  const keepIds = db.prepare('SELECT id FROM logs ORDER BY id DESC LIMIT 50').all().map((r) => r.id);
  if (keepIds.length > 0) {
    const placeholders = keepIds.map(() => '?').join(',');
    db.prepare(`DELETE FROM logs WHERE id NOT IN (${placeholders})`).run(...keepIds);
  } else {
    db.prepare('DELETE FROM logs').run();
  }
  res.json({ ok: true });
});

module.exports = router;
