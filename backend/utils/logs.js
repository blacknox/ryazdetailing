// utils/logs.js — запись в серверный журнал действий (таблица logs).
// Раньше журнал вёлся только в localStorage самого браузера админа —
// ни один другой администратор его не видел, и он пропадал при очистке браузера.
// Тут источник правды один на всех. Для изменений хранится «было → стало».
const db = require('../db');

const insert = db.prepare(
  'INSERT INTO logs (admin_login, action, entity_id, details, changes, ip) VALUES (?, ?, ?, ?, ?, ?)'
);

// Поля с такими именами в журнал не попадают никогда (хэши паролей, токены и т.п.).
const SECRET_RE = /pass|hash|token|secret|cookie/i;
const MAX_VALUE = 200;     // одно значение в журнале
const MAX_CHANGES = 3000;  // весь JSON с изменениями

function clip(v) {
  if (v === undefined || v === null) return null;
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return s.length > MAX_VALUE ? s.slice(0, MAX_VALUE) + '…' : s;
}

/**
 * Что изменилось между двумя состояниями объекта.
 * @param {object} before  состояние до (для удаления — удаляемая запись)
 * @param {object} after   состояние после (для удаления — {})
 * @param {string[]} fields какие поля сравнивать
 * @returns {object|null}  { поле: [старое, новое] } только для изменившихся; null, если изменений нет
 */
function diffFields(before, after, fields) {
  const out = {};
  for (const f of fields) {
    if (SECRET_RE.test(f)) continue;
    const a = clip(before ? before[f] : null);
    const b = clip(after ? after[f] : null);
    if (a !== b) out[f] = [a, b];
  }
  return Object.keys(out).length ? out : null;
}

function serializeChanges(changes) {
  if (!changes) return null;
  let json = JSON.stringify(changes);
  if (json.length > MAX_CHANGES) json = JSON.stringify({ _обрезано: [`изменений слишком много (${json.length} симв.)`, null] });
  return json;
}

/**
 * @param {{login: string}} admin — обычно req.admin (из JWT, уже проверен requireAuth)
 * @param {string} action — короткое описание действия, например "Изменена цена услуги"
 * @param {string|number} [entityId] — id связанной записи, если есть
 * @param {string} [details] — произвольные подробности для колонки "Детали"
 * @param {object|null} [changes] — результат diffFields(): что было → что стало
 * @param {string} [ip] — адрес (для событий безопасности)
 */
function addLog(admin, action, entityId, details, changes, ip) {
  try {
    insert.run(
      admin && admin.login ? admin.login : '—',
      action,
      entityId !== undefined && entityId !== null ? String(entityId) : null,
      details || null,
      serializeChanges(changes),
      ip || null
    );
  } catch (err) {
    // Лог — вспомогательная вещь; если запись в него не удалась, основное
    // действие (бронь, отзыв и т.д.) всё равно не должно откатываться из-за этого.
    console.error('[logs] Не удалось записать лог:', err.message);
  }
}

module.exports = { addLog, diffFields };
