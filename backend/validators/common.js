// validators/common.js — общие мелкие проверки для всех маршрутов.
// Правило: фронтенд проверяет «для удобства», а решение всегда принимает сервер.

// Целое число в диапазоне. Принимает число или строку из цифр ("5", " 12 "),
// но НЕ "5abc", "1e3", "" и дробные — parseInt() молча пропускал такое.
// Возвращает число либо null, если значение не подходит.
function toInt(value, min, max) {
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) return null;
  } else if (typeof value === 'string') {
    if (!/^-?\d+$/.test(value.trim())) return null;
  } else {
    return null;
  }
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < min || n > max) return null;
  return n;
}

// Строка с ограничением длины. required=true — пустая строка тоже ошибка.
// Возвращает { value } либо { error }.
function textField(value, label, max, { required = false, min = 0 } = {}) {
  if (value === undefined || value === null || value === '') {
    return required ? { error: `Укажите поле «${label}»` } : { value: null };
  }
  if (typeof value !== 'string' && typeof value !== 'number') {
    return { error: `Некорректное значение поля «${label}»` };
  }
  const s = String(value).trim();
  if (required && s.length === 0) return { error: `Укажите поле «${label}»` };
  if (s.length < min) return { error: `Поле «${label}» слишком короткое` };
  if (s.length > max) return { error: `Поле «${label}» слишком длинное (максимум ${max} символов)` };
  return { value: s };
}

// Прогоняет набор проверок, возвращает первую ошибку (или null).
function firstError(results) {
  for (const r of results) if (r && r.error) return r.error;
  return null;
}

module.exports = { toInt, textField, firstError };
