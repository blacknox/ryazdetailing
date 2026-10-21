// routes/system.js — состояние сервера для раздела «Настройки» в админке (только чтение).
// Показывает реальное состояние резервных копий (их делает deploy/backup.sh) и настроен ли Telegram.
// Секретов не отдаёт: только «настроено / не настроено». Только для роли admin.
const express = require('express');
const fs = require('fs');
const path = require('path');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireRole('admin'));

const BACKUP_DIR = path.join(__dirname, '..', 'backups');

// Последняя локальная копия базы + сколько их всего
function localBackups() {
  let names;
  try { names = fs.readdirSync(BACKUP_DIR); } catch { return null; }
  const files = names
    .filter((n) => /^ryazdetailing_.*\.db\.gz$/.test(n))
    .map((n) => { const st = fs.statSync(path.join(BACKUP_DIR, n)); return { name: n, time: st.mtime, size: st.size }; })
    .sort((a, b) => b.time - a.time);
  if (!files.length) return { count: 0, last: null };
  const l = files[0];
  return { count: files.length, last: { name: l.name, time: l.time.toISOString(), sizeKB: Math.max(1, Math.round(l.size / 1024)) } };
}

// Результат последней выгрузки вне сервера (пишет backup.sh: "<время> OK|FAIL <файл>")
function offsiteStatus() {
  try {
    const line = fs.readFileSync(path.join(BACKUP_DIR, 'offsite_status.txt'), 'utf8').trim().split('\n').pop();
    const m = line.match(/^(\S+)\s+(OK|FAIL)\s*(.*)$/);
    if (!m) return null;
    const t = new Date(m[1]);
    return { status: m[2] === 'OK' ? 'ok' : 'fail', time: isNaN(t) ? null : t.toISOString(), file: m[3] || '' };
  } catch { return null; }
}

// GET /api/system/status
router.get('/status', (req, res) => {
  res.json({
    backups: { local: localBackups(), offsite: offsiteStatus() },
    telegram: { configured: !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) },
    serverTime: new Date().toISOString(),
  });
});

module.exports = router;
