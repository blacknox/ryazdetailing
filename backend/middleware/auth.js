// middleware/auth.js — проверка JWT-токена для защищённых маршрутов админки.
const jwt = require('jsonwebtoken');
const db = require('../db');

const COOKIE_NAME = 'rd_session';
const SESSION_MS = 12 * 60 * 60 * 1000; // как expiresIn у JWT

function readCookie(req, name) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) {
      try { return decodeURIComponent(part.slice(i + 1).trim()); } catch { return null; }
    }
  }
  return null;
}

// Сессия живёт в HttpOnly-cookie: JavaScript страницы её не видит, поэтому даже
// при XSS украсть токен скриптом нельзя. SameSite=Strict + Path=/api — cookie
// уходит только на наши API-запросы со своего сайта. Secure ставится, когда
// соединение по HTTPS (за прокси это определяется через trust proxy).
function setSessionCookie(req, res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true, sameSite: 'strict', secure: !!req.secure, path: '/api', maxAge: SESSION_MS,
  });
}
function clearSessionCookie(req, res) {
  res.clearCookie(COOKIE_NAME, { httpOnly: true, sameSite: 'strict', secure: !!req.secure, path: '/api' });
}

function requireAuth(req, res, next) {
  // Ответы админки содержат персональные данные клиентов — не кешировать ни в браузере, ни в прокси.
  res.set('Cache-Control', 'no-store');
  const header = req.headers.authorization || '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : null;
  const cookieToken = bearer ? null : readCookie(req, COOKIE_NAME);
  const token = bearer || cookieToken;

  if (!token) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }

  // Доп. защита от CSRF для запросов по cookie: изменяющим запросам нужен
  // служебный заголовок. Чужой сайт не может отправить его без CORS-разрешения,
  // а наш CORS чужие домены не пускает.
  if (cookieToken && !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
      req.headers['x-requested-with'] !== 'rd-admin') {
    return res.status(403).json({ error: 'Запрос отклонён (CSRF-защита)' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    // Права берём из БД, а не из токена: отключённый администратор или
    // изменённая роль перестают действовать сразу, а не через 12 часов.
    const admin = db.prepare('SELECT id, login, role, active FROM admins WHERE id = ?').get(payload.id);
    if (!admin || !admin.active) {
      return res.status(401).json({ error: 'Учётная запись отключена' });
    }
    req.admin = { id: admin.id, login: admin.login, role: admin.role };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Недействительный или истёкший токен' });
  }
}

// requireRole('admin') — использовать ПОСЛЕ requireAuth на маршрутах, которые
// manager видеть/трогать не должен (цены, контент сайта, другие администраторы).
// До этой правки роль лежала в JWT, но реально нигде не проверялась — у
// manager был фактически полный доступ admin.
function requireRole(...allowed) {
  return (req, res, next) => {
    if (!req.admin || !allowed.includes(req.admin.role)) {
      return res.status(403).json({ error: 'Недостаточно прав для этого действия' });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole, setSessionCookie, clearSessionCookie };
