// admin-app/money.js — единый источник истины для денежных расчётов админки.
// Подключается ПЕРВЫМ после core.js. Используют finance.js, dashboard.js и др.
// Правило: сумма заявки — это b.price, зафиксированный при создании заявки.
// Текущая цена услуги из прайса берётся ТОЛЬКО для старых заявок без b.price.
const Money = (() => {
  const num = v => (typeof v === 'number' && isFinite(v) ? v : 0);

  // Цена заявки (зафиксированная; fallback — текущая цена услуги).
  function priceOf(b, svcList) {
    if (b.price !== null && b.price !== undefined) return num(b.price);
    const list = svcList || (typeof services !== 'undefined' ? services : []);
    const s = list.find(x => x.name === b.svc);
    return s ? num(s.price) : 0;
  }

  // Фактически полученные деньги: max(оплачено, предоплата) минус возврат.
  function netPaid(b) {
    return Math.max(num(b.paid), num(b.prepay)) - num(b.refund);
  }

  // Долг клиента по выполненной заявке (не меньше 0).
  function debtOf(b, svcList) {
    return Math.max(0, priceOf(b, svcList) - netPaid(b));
  }

  // Выручка по выполненным заявкам; filterFn — необязательный фильтр (по дате и т.п.).
  function revenue(list, filterFn, svcList) {
    return list
      .filter(b => b.status === 'done' && (!filterFn || filterFn(b)))
      .reduce((acc, b) => acc + priceOf(b, svcList), 0);
  }

  // Прибавить n дней к дате YYYY-MM-DD (без часовых поясов и перехода на летнее время).
  function addDays(iso, n) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
  }

  // Выручка за период [from, to] включительно (даты YYYY-MM-DD). Заявки с датой в будущем
  // не попадают в «сегодня / 7 дней / 30 дней» — только в «Всего».
  function revenueRange(list, from, to, svcList) {
    return revenue(list, (b) => b.date >= from && b.date <= to, svcList);
  }

  // Окна «за N дней» включают сегодняшний день: N=7 → сегодня и 6 предыдущих.
  function revenueLastDays(list, today, days, svcList) {
    return revenueRange(list, addDays(today, -(days - 1)), today, svcList);
  }

  return { priceOf, netPaid, debtOf, revenue, addDays, revenueRange, revenueLastDays };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = Money;
