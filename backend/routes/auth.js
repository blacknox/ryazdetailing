// routes/auth.js — логин администратора/менеджера.
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { addLog } = require('../utils/logs');
const { setSessionCookie, clearSessionCookie } = require('../middleware/auth');
const guard = require('../utils/loginGuard');

// Для несуществующего логина всё равно считаем bcrypt: иначе по времени ответа
// (быстро / медленно) можно угадывать, какие логины существуют.
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', 12);

const router = express.Router();

// Защита от подбора пароля: не больше 10 попыток за 15 минут с одного IP.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много попыток входа. Попробуйте позже.' },
});

router.post('/login', loginLimiter, (req, res) => {
  const { login, password } = req.body || {};

  if (!login || !password) {
    return res.status(400).json({ error: 'Укажите логин и пароль' });
  }
  if (typeof login !== 'string' || typeof password !== 'string' || login.length > 64 || password.length > 200) {
    return res.status(400).json({ error: 'Некорректный логин или пароль' });
  }

  // Прогрессивная блокировка: после серии ошибок вход временно закрыт (см. utils/loginGuard.js).
  const ip = req.ip;
  const lock = guard.check(ip, login);
  if (lock.locked) {
    res.set('Retry-After', String(lock.retryAfterSec));
    return res.status(429).json({
      error: `Слишком много неудачных попыток. Повторите через ${Math.max(1, Math.ceil(lock.retryAfterSec / 60))} мин.`,
    });
  }

  const admin = db.prepare('SELECT * FROM admins WHERE login = ?').get(login);
  const passwordOk = bcrypt.compareSync(password, admin ? admin.password_hash : DUMMY_HASH);

  // Намеренно одинаковое сообщение об ошибке для несуществующего логина,
  // неверного пароля и отключённого аккаунта — чтобы не раскрывать лишнего.
  if (!admin || !passwordOk || !admin.active) {
    const f = guard.fail(ip, login, !!admin);
    // В журнал — не каждую ошибку (иначе перебор забьёт журнал), а первые и момент блокировки.
    if (f.lockedNow || f.fails <= 3) {
      addLog(
        { login: admin ? admin.login : '(неизвестный логин)' },
        f.lockedNow ? 'Блокировка входа' : 'Неудачный вход',
        null,
        f.lockedNow ? `на ${Math.max(1, Math.ceil(f.retryAfterSec / 60))} мин после ${f.fails} ошибок подряд` : null,
        null,
        ip
      );
    }
    return res.status(401).json({ error: 'Неверный логин или пароль' });
  }
  guard.success(ip, login);

  const token = jwt.sign(
    { id: admin.id, login: admin.login, role: admin.role },
    process.env.JWT_SECRET,
    { expiresIn: '12h' }
  );

  addLog(admin, 'Вход в систему', null, null);

  // Токен отдаём только в HttpOnly-cookie и в тело ответа НЕ кладём —
  // скрипты страницы его не увидят.
  setSessionCookie(req, res, token);
  res.json({
    admin: { id: admin.id, login: admin.login, role: admin.role },
  });
});

// Выход: сервер стирает cookie (из JS это сделать нельзя — она HttpOnly).
router.post('/logout', (req, res) => {
  clearSessionCookie(req, res);
  res.json({ ok: true });
});

// Смена собственного пароля (доступно только авторизованному администратору).
const { requireAuth } = require('../middleware/auth');
const { weakPasswordReason } = require('../utils/startupChecks');

router.post('/change-password', requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};

  if (typeof currentPassword !== 'string' || typeof newPassword !== 'string' || !currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Укажите текущий и новый пароль' });
  }
  // Единая политика с созданием аккаунта (utils/startupChecks.js).
  const weak = weakPasswordReason(newPassword);
  if (weak) {
    return res.status(400).json({ error: `Новый пароль не подходит: ${weak}` });
  }
  if (newPassword === currentPassword) {
    return res.status(400).json({ error: 'Новый пароль должен отличаться от текущего' });
  }

  const admin = db.prepare('SELECT * FROM admins WHERE id = ?').get(req.admin.id);
  if (!admin || !bcrypt.compareSync(currentPassword, admin.password_hash)) {
    return res.status(401).json({ error: 'Текущий пароль неверен' });
  }

  const newHash = bcrypt.hashSync(newPassword, 12);
  db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(newHash, admin.id);

  res.json({ ok: true });
});

// Текущий администратор по сессии — нужен, чтобы после обновления страницы
// (вход по сохранённой cookie, без повторного логина) фронтенд знал
// настоящую роль и id, а не считал всех заново вошедших «главным админом».
router.get('/me', requireAuth, (req, res) => {
  res.json({ admin: { id: req.admin.id, login: req.admin.login, role: req.admin.role } });
});

module.exports = router;
