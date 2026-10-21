// Запуск: npm test  (встроенный раннер Node, без доп. зависимостей)
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateBookingFinancials: fin } = require('../../validators/booking');
const { validateStars } = require('../../validators/review');
const { validateService } = require('../../validators/service');
const { validateWork } = require('../../validators/work');
const { isAllowedImagePath } = require('../../validators/images');
const { toInt } = require('../../validators/common');
const { slugify, uniqueSlug } = require('../../utils/slug');
const { resolveInsideUploads } = require('../../utils/imageStore');

const cur = { price: 3000, prepay: 0, paid: 0, refund: 0 };

test('toInt: только целые из цифр', () => {
  assert.equal(toInt('12', 0, 100), 12);
  for (const bad of ['5abc', '1e3', '', 4.5, null, [], {}, -1, 101]) assert.equal(toInt(bad, 0, 100), null, String(bad));
});

test('stars: 1..5 целые', () => {
  for (const ok of [1, 5, '3']) assert.equal(validateStars(ok).value, Number(ok));
  for (const bad of [0, 6, 4.5, '5abc', [], null, undefined]) assert.ok(validateStars(bad).error, String(bad));
});

test('финансы: инварианты', () => {
  assert.equal(fin(cur, {}).values, null);
  assert.ok(fin(cur, { prepay_amount: 3001 }).error);
  assert.ok(fin(cur, { paid_amount: 3001 }).error);
  assert.ok(fin(cur, { refund_amount: 1 }).error);                       // вернуть нечего
  assert.ok(fin(cur, { paid_amount: -1 }).error);
  assert.ok(fin(cur, { paid_amount: '12abc' }).error);
  assert.equal(fin(cur, { prepay_amount: 500, refund_amount: 500 }).values.pay, 'refund'); // возврат предоплаты
  assert.ok(fin(cur, { pay: 'paid', paid_amount: 2000 }).error);          // «оплачено», но не вся цена
  assert.equal(fin(cur, { pay: 'paid' }).values.paid, 3000);              // быстрая кнопка
  assert.ok(fin(cur, { pay: 'refund' }).error);
  assert.ok(fin(cur, { pay: 'nope' }).error);
});

test('финансы: менеджер не меняет цену', () => {
  const r = fin(cur, { price: 100 }, { role: 'manager', lockedPrice: 3000 });
  assert.equal(r.status, 403);
  assert.ok(fin(cur, { price: 3000 }, { role: 'manager', lockedPrice: 3000 }).values);
  assert.ok(fin(cur, { price: 100 }, { role: 'admin', lockedPrice: 3000 }).values);
});

test('услуги и работы: лимиты', () => {
  assert.ok(validateService({ name: 'x'.repeat(121), price: 1 }).error);
  assert.ok(validateService({ name: 'ok', price: 'abc' }).error);
  assert.ok(validateService({ name: 'ok', price: 100, discount: 101 }).error);
  assert.deepEqual(validateService({ desc: '' }, { partial: true }).values, { desc: '' });
  assert.ok(validateWork({ name: 'w', cat: 'c'.repeat(81) }).error);
  assert.ok(validateWork({ name: 'w', time: 't'.repeat(51) }).error);
  assert.ok(validateWork({ name: 'w', desc: 'd'.repeat(2001) }).error);
});

test('изображения: allowlist путей', () => {
  for (const ok of ['assets/a.webp', '/assets/a b.webp', '/uploads/services/1.jpg']) assert.ok(isAllowedImagePath(ok), ok);
  for (const bad of ['javascript:alert(1)', 'data:image/png;base64,AA', 'file:///etc/passwd', 'ftp://x/a.jpg', 'https://evil.com/a.jpg',
    '/uploads/../x.jpg', '//evil.com/a.jpg', '/assets/%2e%2e/x.png', '/uploads/a.php', '/assets/a.webp")']) assert.ok(!isAllowedImagePath(bad), bad);
});

test('deleteStoredImage: путь не выходит за uploads', () => {
  assert.ok(resolveInsideUploads('/uploads/reviews/a.jpg'));
  for (const bad of ['/uploads/../db.js', '/uploads/../uploads-evil/x.jpg', '/uploads//etc/passwd', '/uploads/', '/assets/x.webp']) {
    assert.equal(resolveInsideUploads(bad), null, bad);
  }
});

test('slug: транслитерация и уникальность', () => {
  assert.equal(slugify('Мойка двигателя'), 'moyka-dvigatelya');
  assert.equal(slugify('!!!'), 'service');
  const taken = new Set(['a', 'a-2']);
  assert.equal(uniqueSlug('A', (c) => taken.has(c)), 'a-3');
});
