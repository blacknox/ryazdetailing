// validators/review.js — единые правила для отзывов (публичный POST, manual, PATCH).
const { toInt, textField } = require('./common');

const LIMITS = { name: 80, text: 3000, svc: 300, date: 40 };

// Оценка — только целое 1…5. "5abc", 4.5, 0, 6, [], {} — отказ.
function validateStars(stars) {
  const n = toInt(stars, 1, 5);
  return n === null ? { error: 'Оценка — целое число от 1 до 5' } : { value: n };
}

// Общие проверки текстовых полей. partial=true (PATCH): отсутствующие поля пропускаем.
function validateReviewText({ name, text, svc, date }, { partial = false } = {}) {
  const out = {};
  const checks = [
    ['name', name, 'Имя', LIMITS.name, { required: !partial, min: 2 }],
    ['text', text, 'Текст отзыва', LIMITS.text, { required: !partial, min: 3 }],
    ['svc', Array.isArray(svc) ? svc.join(', ') : svc, 'Услуга', LIMITS.svc, {}],
    ['date', date, 'Дата', LIMITS.date, {}],
  ];
  for (const [key, val, label, max, opts] of checks) {
    if (partial && val === undefined) continue;
    const r = textField(val, label, max, opts);
    if (r.error) return { error: r.error };
    out[key] = r.value;
  }
  return { values: out };
}

module.exports = { validateStars, validateReviewText, LIMITS };
