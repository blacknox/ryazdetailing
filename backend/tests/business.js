// tests/business.js — бизнес-логика: снимок цены (финансы), путь заявки до «выполнена», модерация отзывов,
// работы с XSS-строкой (API хранит текст как данные, экранирование — на выводе, это проверяют фронтенд/E2E тесты).
const base = `http://127.0.0.1:${process.env.PORT || 3999}/api`;
let pass = 0, fail = 0;
const ok = (n, c, x) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : '  -> ' + JSON.stringify(x))); };
async function call(method, p, body, cookie) {
  const r = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'rd-admin', ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch { /* пусто */ }
  return { s: r.status, j, cookie: (r.headers.get('set-cookie') || '').split(';')[0] };
}
const nextWeekday = (offset) => { const d = new Date(Date.now() + offset * 864e5); while ([0, 6].includes(d.getDay())) d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); };

(async () => {
  let r = await call('POST', '/auth/login', { login: 'admin', password: 'Rz!Tester-Alpha-2026' });
  const adm = r.cookie; ok('admin login', !!adm, r);

  // ── Снимок цены ──
  r = await call('POST', '/services', { name: 'Снимок цены', price: 1000 }, adm);
  ok('услуга создана', r.s === 201, r);
  const svc = r.j.service;
  const date = nextWeekday(4);
  r = await call('POST', '/bookings', { name: 'Клиент Цена', phone: '+7 (910) 700-00-01', service: svc.name, date, time: '12:00' });
  ok('публичная запись создана', r.s === 201, r);
  const bid = r.j.booking.id;
  ok('в ответе цена заявки зафиксирована = 1000', r.j.booking.price === 1000, r.j.booking);

  r = await call('PATCH', `/services/${svc.id}`, { price: 1500 }, adm);
  ok('цена услуги изменена на 1500', r.s === 200 && r.j.service.price === 1500, r);
  r = await call('GET', '/bookings', null, adm);
  let b = r.j.bookings.find((x) => x.id === bid);
  ok('снимок: цена старой заявки осталась 1000', b && b.price === 1000, b);
  r = await call('POST', '/bookings', { name: 'Клиент Новая Цена', phone: '+7 (910) 700-00-02', service: svc.name, date, time: '13:00' });
  ok('новая заявка получает новую цену 1500', r.s === 201 && r.j.booking.price === 1500, r);

  // ── Путь заявки до «выполнена» + деньги ──
  r = await call('PATCH', `/bookings/${bid}`, { status: 'confirmed' }, adm);
  ok('статус → confirmed', r.s === 200, r);
  r = await call('PATCH', `/bookings/${bid}`, { status: 'done', paid_amount: 1000 }, adm);
  ok('статус → done с оплатой 1000', r.s === 200, r);
  r = await call('GET', '/bookings', null, adm);
  b = r.j.bookings.find((x) => x.id === bid);
  ok('после done: цена 1000, оплачено 1000, статус done', b && b.status === 'done' && b.price === 1000 && b.paid_amount === 1000, b);
  r = await call('PATCH', `/bookings/${bid}`, { refund_amount: 5000 }, adm);
  ok('возврат больше оплаты → 4xx', r.s >= 400 && r.s < 500, r);
  r = await call('PATCH', `/bookings/${bid}`, { paid_amount: -5 }, adm);
  ok('отрицательная оплата → 4xx', r.s >= 400 && r.s < 500, r);
  r = await call('PATCH', `/bookings/${bid}`, { status: 'wat' }, adm);
  ok('неизвестный статус → 4xx', r.s >= 400 && r.s < 500, r);

  // ── Повторная отправка формы (дубль слота) ──
  r = await call('POST', '/bookings', { name: 'Дубль', phone: '+7 (910) 700-00-03', service: svc.name, date, time: '13:00' });
  ok('занятый слот → 409/400', r.s === 409 || r.s === 400, r);
  r = await call('POST', '/bookings', { name: 'Дубль', phone: 'abc', service: svc.name, date, time: '14:00' });
  ok('некорректный телефон → 400', r.s === 400, r);
  r = await call('POST', '/bookings', { name: 'Дубль', phone: '+7 (910) 700-00-04', service: svc.name, date: '2020-01-01', time: '14:00' });
  ok('дата в прошлом → 4xx', r.s >= 400 && r.s < 500, r);
  r = await call('POST', '/bookings', { name: 'Дубль', phone: '+7 (910) 700-00-04', service: 'Несуществующая услуга', date, time: '14:00' });
  ok('неизвестная услуга → 4xx', r.s >= 400 && r.s < 500, r);

  // ── Отзывы: публичная отправка → модерация → публикация → скрытие ──
  const XSS = '<img src=x onerror=alert(1)>';
  r = await call('POST', '/reviews', { name: 'Аноним', stars: 5, text: 'Отлично! ' + XSS, svc: svc.name });
  ok('публичный отзыв принят (на модерацию)', r.s === 201, r);
  const rid = r.j.id;
  r = await call('GET', '/reviews');
  ok('неопубликованный отзыв не виден публично', !JSON.stringify(r.j).includes('Аноним'), r.j);
  r = await call('PATCH', `/reviews/${rid}`, { status: 'published' }, adm);
  ok('админ публикует отзыв', r.s === 200, r);
  r = await call('GET', '/reviews');
  const pubList = r.j.reviews || r.j;
  const pub = pubList.find((x) => x.id === rid);
  ok('отзыв виден публично; XSS-строка хранится как данные', pub && pub.text.includes(XSS), pub);
  r = await call('PATCH', `/reviews/${rid}`, { status: 'hidden' }, adm);
  r = await call('GET', '/reviews');
  ok('скрытый отзыв исчез из публичного API', !(r.j.reviews || r.j).some((x) => x.id === rid), r.j);

  // ── Работы: XSS-строка в названии принимается как данные, длинные значения — нет ──
  r = await call('POST', '/works', { name: XSS, cat: 'Керамика', time: '3 дня' }, adm);
  ok('работа с HTML в названии сохраняется как текст (экранируется при выводе)', r.s === 201 || r.s === 200, r);
  r = await call('POST', '/works', { name: 'Ок', cat: 'К'.repeat(500), time: '1' }, adm);
  ok('работа: слишком длинная категория → 400', r.s === 400, r);

  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
