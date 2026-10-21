// validators/work.js — «Наши работы» (до/после). Лимиты из плана 10/10.
const { textField } = require('./common');

const LIMITS = { name: 120, cat: 80, time: 50, desc: 2000 };

function validateWork(body, { partial = false } = {}) {
  const b = body || {};
  const v = {};
  const fields = [
    ['name', 'Название', LIMITS.name, { required: !partial }],
    ['cat', 'Категория', LIMITS.cat, {}],
    ['time', 'Время работы', LIMITS.time, {}],
    ['desc', 'Описание', LIMITS.desc, {}],
  ];
  for (const [key, label, max, opts] of fields) {
    if (partial && b[key] === undefined) continue;
    const r = textField(b[key], label, max, opts);
    if (r.error) return r;
    // Название при пустом значении не затираем; остальные поля пустым можно очистить.
    v[key] = r.value === null && key !== 'name' ? '' : r.value;
  }
  return { values: v };
}

module.exports = { validateWork, LIMITS };
