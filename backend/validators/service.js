// validators/service.js — услуги и цены (POST и PATCH).
const { toInt, textField } = require('./common');

const LIMITS = { name: 120, dur: 50, desc: 1000, fullDesc: 5000 };
const MAX_PRICE = 10000000;

// partial=true (PATCH): проверяем только присланные поля.
// Возвращает { values } (уже очищенные поля) либо { error }.
function validateService(body, { partial = false } = {}) {
  const b = body || {};
  const v = {};

  const name = textField(b.name, 'Название', LIMITS.name, { required: !partial });
  if (name.error) return name;
  if (!(partial && b.name === undefined)) v.name = name.value;

  if (!(partial && b.price === undefined)) {
    const price = toInt(b.price, 0, MAX_PRICE);
    if (price === null) return { error: 'Цена — целое число рублей от 0 до 10 000 000' };
    if (!partial && price === 0) return { error: 'Укажите цену' };
    v.price = price;
  }
  if (b.discount !== undefined && b.discount !== null && b.discount !== '') {
    const d = toInt(b.discount, 0, 100);
    if (d === null) return { error: 'Скидка — целое число от 0 до 100' };
    v.discount = d;
  } else if (!partial) {
    v.discount = 0;
  }
  for (const [key, label, max] of [['dur', 'Длительность', LIMITS.dur], ['desc', 'Описание', LIMITS.desc], ['fullDesc', 'Полное описание', LIMITS.fullDesc]]) {
    if (b[key] === undefined) continue;
    const r = textField(b[key], label, max);
    if (r.error) return r;
    // Присланное пустое значение = «очистить поле» (пустая строка), а не «не менять».
    v[key] = r.value === null ? '' : r.value;
  }
  return { values: v };
}

module.exports = { validateService, LIMITS, MAX_PRICE };
