// Единый источник денежных расчётов: admin-app/money.js
const test = require('node:test');
const assert = require('node:assert');
const Money = require('../admin-app/money.js');

const services = [{ name: 'Мойка', price: 1000 }];

test('priceOf: зафиксированная цена заявки важнее текущей цены услуги', () => {
  assert.strictEqual(Money.priceOf({ svc: 'Мойка', price: 800 }, services), 800);
});

test('priceOf: для старой заявки без price берётся текущая цена услуги', () => {
  assert.strictEqual(Money.priceOf({ svc: 'Мойка', price: null }, services), 1000);
  assert.strictEqual(Money.priceOf({ svc: 'Неизвестно' }, services), 0);
});

test('priceOf: цена 0 — это валидная цена, а не «пусто»', () => {
  assert.strictEqual(Money.priceOf({ svc: 'Мойка', price: 0 }, services), 0);
});

test('netPaid: max(оплачено, предоплата) минус возврат', () => {
  assert.strictEqual(Money.netPaid({ paid: 500, prepay: 300, refund: 100 }), 400);
  assert.strictEqual(Money.netPaid({ paid: 0, prepay: 300, refund: 0 }), 300);
});

test('revenue: считается только по done и по зафиксированной цене (finance == dashboard)', () => {
  const bookings = [
    { status: 'done', date: '2026-10-16', svc: 'Мойка', price: 800 },
    { status: 'done', date: '2026-10-16', svc: 'Мойка', price: null },
    { status: 'new', date: '2026-10-16', svc: 'Мойка', price: 5000 },
    { status: 'done', date: '2026-10-15', svc: 'Мойка', price: 700 },
  ];
  const today = Money.revenue(bookings, (b) => b.date === '2026-10-16', services);
  assert.strictEqual(today, 1800);
  const all = Money.revenue(bookings, null, services);
  assert.strictEqual(all, 2500);
});

test('debtOf: долг не бывает отрицательным', () => {
  assert.strictEqual(Money.debtOf({ svc: 'Мойка', price: 500, paid: 900 }, services), 0);
  assert.strictEqual(Money.debtOf({ svc: 'Мойка', price: 800, paid: 300 }, services), 500);
});

test('addDays: переход через месяц, год и високосный день', () => {
  assert.strictEqual(Money.addDays('2026-10-16', -6), '2026-10-10');
  assert.strictEqual(Money.addDays('2026-03-02', -2), '2026-02-28');
  assert.strictEqual(Money.addDays('2028-03-01', -1), '2028-02-29');
  assert.strictEqual(Money.addDays('2026-12-31', 1), '2027-01-01');
});

test('регрессия: заявки с датой в будущем не попадают в «сегодня», «7 дней» и «30 дней»', () => {
  const today = '2026-10-16';
  const bookings = [
    { status: 'done', date: '2026-10-16', price: 2500 },   // сегодня
    { status: 'done', date: '2026-10-20', price: 5000 },   // будущее
    { status: 'done', date: '2026-10-10', price: 1000 },   // 6 дней назад (входит в 7)
    { status: 'done', date: '2026-10-09', price: 700 },    // 7 дней назад (не входит в 7, входит в 30)
    { status: 'done', date: '2026-09-17', price: 300 },    // 29 дней назад (входит в 30)
    { status: 'done', date: '2026-09-16', price: 200 },    // 30 дней назад (не входит)
  ];
  assert.strictEqual(Money.revenueLastDays(bookings, today, 1, []), 2500);
  assert.strictEqual(Money.revenueLastDays(bookings, today, 7, []), 3500);
  assert.strictEqual(Money.revenueLastDays(bookings, today, 30, []), 4500);
  assert.strictEqual(Money.revenue(bookings, null, []), 9700); // «Всего» считает всё
});
