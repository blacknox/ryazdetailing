// validators/booking.js — ЕДИНЫЙ источник правил по деньгам в записи.
// Используется и в PATCH /api/bookings/:id, и в POST /api/bookings/manual —
// раньше у них были разные проверки (в manual не было paid/refund вовсе).
//
// Смысл полей (одинаковый везде):
//   price          — цена услуги, снимок на момент создания записи (₽, целое)
//   prepay_amount  — сумма внесённой предоплаты
//   paid_amount    — итоговая оплата по услуге (включая ранее внесённую предоплату)
//   refund_amount  — сколько денег вернули клиенту
// Деньги, реально полученные от клиента:  received = max(paid, prepay)
// Чистая оплата:                           net      = received − refund
//
// Инварианты:
//   • все суммы — целые рубли, 0 … 10 000 000;
//   • если цена известна: prepay ≤ price и paid ≤ price;
//   • refund ≤ received  (нельзя вернуть больше, чем получили), значит net ≥ 0;
//   • net ≤ price (следует из двух предыдущих).
const { toInt } = require('./common');

const MAX_AMOUNT = 10000000;
const ALLOWED_PAY = ['none', 'prepay', 'paid', 'refund'];

const blank = (v) => v === undefined || v === null || v === '';

/**
 * @param {{price: number|null, prepay: number, paid: number, refund: number}} current
 *        текущие значения (для PATCH — из БД; для новой записи — цена из прайса и нули)
 * @param {object} input  { price, prepay_amount, paid_amount, refund_amount, pay } из тела запроса
 * @param {{role?: string, lockedPrice?: number|null}} opts
 *        role !== 'admin' → цену менять нельзя (допустима только lockedPrice)
 * @returns {{values: object|null}|{error: string, status: number}}
 *   values === null — денег в запросе нет, ничего менять не нужно.
 */
function validateBookingFinancials(current, input, opts = {}) {
  const inp = input || {};
  const touched = [inp.price, inp.prepay_amount, inp.paid_amount, inp.refund_amount, inp.pay].some((v) => !blank(v));
  const fail = (error, status = 400) => ({ error, status });

  if (!blank(inp.pay) && !ALLOWED_PAY.includes(inp.pay)) return fail('Недопустимый статус оплаты');
  if (!touched) return { values: null };

  const parse = (raw, label, fallback) => {
    if (blank(raw)) return { value: fallback };
    const n = toInt(raw, 0, MAX_AMOUNT);
    return n === null ? { error: `Некорректная сумма «${label}»: целое число рублей от 0 до 10 000 000` } : { value: n };
  };

  const rPrice = parse(inp.price, 'цена', current.price);
  const rPrepay = parse(inp.prepay_amount, 'предоплата', current.prepay || 0);
  const rPaid = parse(inp.paid_amount, 'оплачено', current.paid || 0);
  const rRefund = parse(inp.refund_amount, 'возврат', current.refund || 0);
  for (const r of [rPrice, rPrepay, rPaid, rRefund]) if (r.error) return fail(r.error);

  const price = rPrice.value;
  const prepay = rPrepay.value;
  let paid = rPaid.value;
  const refund = rRefund.value;

  // Менеджер не меняет цену: допустимо только значение из прайса / текущее.
  if (opts.role && opts.role !== 'admin' && !blank(inp.price)) {
    const locked = opts.lockedPrice === undefined ? null : opts.lockedPrice;
    if (locked === null || price !== locked) {
      return fail('Менеджер не может менять цену, отличную от прайса', 403);
    }
  }

  const priceKnown = price !== null && price > 0;
  if (priceKnown && prepay > price) return fail(`Предоплата (${prepay} ₽) больше цены (${price} ₽)`);
  if (priceKnown && paid > price) return fail(`Оплачено (${paid} ₽) больше цены (${price} ₽)`);

  // Быстрая кнопка «Оплачено» (или выбор в форме без суммы): полная оплата = цена.
  if (inp.pay === 'paid' && priceKnown && Math.max(paid, prepay) - refund < price && paid === 0) {
    paid = price;
  }

  const received = Math.max(paid, prepay);
  if (refund > received) {
    return fail(`Возврат (${refund} ₽) больше полученных денег (${received} ₽)`);
  }
  const net = received - refund;

  if (inp.pay === 'paid' && priceKnown && net < price) {
    return fail(`Выбрано «Оплачено», но чистая оплата ${net} ₽ из ${price} ₽. Укажите сумму или смените статус`);
  }
  if (inp.pay === 'refund' && refund <= 0) {
    return fail('Выбрано «Возврат», но сумма возврата не указана');
  }

  // Статус оплаты — производное от сумм; явно переданный pay имеет приоритет
  // (так работают быстрые кнопки), но уже проверен на согласованность выше.
  let pay = !blank(inp.pay) ? inp.pay : null;
  if (!pay) {
    if (refund > 0) pay = 'refund';
    else if (priceKnown && paid >= price) pay = 'paid';
    else if (prepay > 0) pay = 'prepay';
    else pay = 'none';
  }

  return { values: { price, prepay, paid, refund, pay } };
}

module.exports = { validateBookingFinancials, ALLOWED_PAY, MAX_AMOUNT };
