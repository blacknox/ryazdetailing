// utils/startupChecks.js — проверки конфигурации при запуске.
// Цель: сервер не должен стартовать с шаблонными паролями или без SITE_DIR в production.
const fs = require('fs');
const path = require('path');

const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_BYTES = 72; // bcrypt молча обрезает всё, что длиннее 72 байт

// Шаблонные значения из .env.example и типичные слабые пароли (сравнение без регистра).
const PLACEHOLDER_MARKERS = [
  'замените', 'changeme', 'change_me', 'change-me', 'your_password', 'yourpassword',
  'example', 'placeholder', 'password', 'пароль', 'admin', 'manager', 'qwerty', '123456',
];

/** Возвращает строку с причиной, если пароль не подходит, иначе null. */
function weakPasswordReason(password) {
  if (typeof password !== 'string') return 'пароль должен быть строкой';
  const p = password;
  if (Buffer.byteLength(p, 'utf8') > MAX_PASSWORD_BYTES) {
    return `слишком длинный (максимум ${MAX_PASSWORD_BYTES} байт, это примерно 36 русских букв)`;
  }
  if (p.length < MIN_PASSWORD_LENGTH) {
    return `слишком короткий (нужно минимум ${MIN_PASSWORD_LENGTH} символов)`;
  }
  const lower = p.toLowerCase();
  const hit = PLACEHOLDER_MARKERS.find((m) => lower.includes(m));
  if (hit) return `похож на шаблонный или слабый пароль (содержит «${hit}»)`;
  if (/^(.)\1+$/.test(p)) return 'состоит из одного повторяющегося символа';
  return null;
}

/** Бросает ошибку, если пароль слабый. label — например 'ADMIN_PASSWORD'. */
function assertStrongPassword(label, password) {
  const reason = weakPasswordReason(password);
  if (reason) {
    throw new Error(
      `${label}: ${reason}. Задайте уникальный пароль от ${MIN_PASSWORD_LENGTH} символов в .env.`
    );
  }
}

/**
 * Проверка окружения production. Возвращает массив ошибок (пустой — всё хорошо).
 * SITE_DIR обязателен, чтобы SEO-страницы услуг и sitemap реально генерировались.
 * Если SEO сознательно не нужен (например, демо на Render), задайте SEO_DISABLED=1.
 */
function productionEnvErrors(env = process.env) {
  const errors = [];
  if (env.NODE_ENV !== 'production') return errors;
  if (env.SEO_DISABLED === '1') return errors;

  const dir = env.SITE_DIR;
  if (!dir) {
    errors.push('SITE_DIR не задан: без него не создаются SEO-страницы услуг и sitemap (для сознательного отключения задайте SEO_DISABLED=1).');
    return errors;
  }
  if (!fs.existsSync(path.join(dir, 'index.html'))) {
    errors.push(`SITE_DIR=${dir}: в папке нет index.html.`);
  }
  try {
    fs.accessSync(dir, fs.constants.W_OK);
  } catch {
    errors.push(`SITE_DIR=${dir}: процесс Node не имеет права записи в папку.`);
  }
  if (!env.SITE_URL || !/^https:\/\//.test(env.SITE_URL)) {
    errors.push('SITE_URL должен быть задан и начинаться с https:// (нужен для canonical и sitemap).');
  }
  return errors;
}

function assertProductionEnv(env = process.env) {
  const errors = productionEnvErrors(env);
  if (errors.length) {
    throw new Error('Конфигурация production некорректна:\n - ' + errors.join('\n - '));
  }
}

module.exports = { MAX_PASSWORD_BYTES, weakPasswordReason, assertStrongPassword, productionEnvErrors, assertProductionEnv, MIN_PASSWORD_LENGTH };
