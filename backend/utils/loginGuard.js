// utils/loginGuard.js — прогрессивная блокировка входа, поверх лимита express-rate-limit.
//
// Два счётчика неудачных попыток (хранятся в БД, переживают перезапуск сервера):
//   • по IP        — 5 ошибок подряд → блокировка 1 мин, дальше каждая новая ошибка удваивает срок (до 30 мин);
//   • по аккаунту  — 10 ошибок подряд → блокировка 1 мин, удвоение, потолок 15 мин.
//     Потолок по аккаунту ниже намеренно: иначе чужак мог бы надолго «запереть» владельца снаружи.
// Успешный вход обнуляет оба счётчика. Если ошибок не было больше часа, счётчик начинается заново.
// Счётчик аккаунта ведётся только для СУЩЕСТВУЮЩИХ логинов — подбор случайных имён не раздувает базу.
const db = require('../db');

const RESET_AFTER_MS = 60 * 60 * 1000;
const RULES = {
  ip: { free: 5, maxLockMs: 30 * 60 * 1000 },
  acct: { free: 10, maxLockMs: 15 * 60 * 1000 },
};

const get = db.prepare('SELECT * FROM login_failures WHERE key = ?');
const upsert = db.prepare(
  `INSERT INTO login_failures (key, fails, locked_until, last_at) VALUES (?, ?, ?, ?)
   ON CONFLICT(key) DO UPDATE SET fails = excluded.fails, locked_until = excluded.locked_until, last_at = excluded.last_at`
);
const del = db.prepare('DELETE FROM login_failures WHERE key = ?');
const prune = db.prepare('DELETE FROM login_failures WHERE last_at < ?');

const keys = (ip, login) => {
  const k = [{ key: `ip:${ip || 'unknown'}`, kind: 'ip' }];
  if (login) k.push({ key: `acct:${String(login).toLowerCase().slice(0, 64)}`, kind: 'acct' });
  return k;
};

/** Заблокирован ли вход сейчас. → { locked: boolean, retryAfterSec: number } */
function check(ip, login, now = Date.now()) {
  let wait = 0;
  for (const { key } of keys(ip, login)) {
    const row = get.get(key);
    if (row && row.locked_until > now) wait = Math.max(wait, row.locked_until - now);
  }
  return { locked: wait > 0, retryAfterSec: Math.ceil(wait / 1000) };
}

/**
 * Записать неудачную попытку.
 * @param {boolean} accountExists считать ли ошибку на счёт аккаунта
 * @returns {{fails: number, lockedNow: boolean, retryAfterSec: number}} по IP-счётчику
 */
function fail(ip, login, accountExists, now = Date.now()) {
  prune.run(now - 24 * 60 * 60 * 1000);
  let result = { fails: 0, lockedNow: false, retryAfterSec: 0 };
  for (const { key, kind } of keys(ip, accountExists ? login : null)) {
    const row = get.get(key);
    const fresh = !row || now - row.last_at > RESET_AFTER_MS;
    const fails = (fresh ? 0 : row.fails) + 1;
    const rule = RULES[kind];
    let lockedUntil = fresh ? 0 : row.locked_until;
    let lockedNow = false;
    if (fails >= rule.free) {
      const lockMs = Math.min(rule.maxLockMs, 60 * 1000 * 2 ** (fails - rule.free));
      lockedUntil = now + lockMs;
      lockedNow = true;
    }
    upsert.run(key, fails, lockedUntil, now);
    if (kind === 'ip') result = { fails, lockedNow, retryAfterSec: lockedNow ? Math.ceil((lockedUntil - now) / 1000) : 0 };
    else if (lockedNow && !result.lockedNow) result = { ...result, lockedNow, retryAfterSec: Math.ceil((lockedUntil - now) / 1000) };
  }
  return result;
}

/** Успешный вход — обнуляем счётчики. */
function success(ip, login) {
  for (const { key } of keys(ip, login)) del.run(key);
}

module.exports = { check, fail, success, RULES };
