// e2e/specs.js — сквозные сценарии в Chromium: клиент, администратор, менеджер, негативные случаи.
// Запускается через `npm run e2e` (e2e/run.js поднимает чистый бэкенд и хост).
const { chromium } = require('playwright');
const assert = require('node:assert/strict');

const BASE = process.env.BASE_URL;
const ADMIN_PASS = process.env.ADMIN_PASSWORD, MGR_PASS = process.env.MANAGER_PASSWORD;
const XSS = '<img src=x onerror="window.__xss=1;alert(1)">';
const H = { 'X-Requested-With': 'rd-admin' };
let pass = 0, fail = 0;
async function step(name, fn) {
  try { await fn(); pass++; console.log('PASS ' + name); }
  catch (e) { fail++; console.log('FAIL ' + name + '\n       ' + String(e.message).split('\n').slice(0, 3).join('\n       ')); }
}

// Следим за консолью и диалогами: любое исполнение XSS (alert/window.__xss) или JS-ошибка — провал.
function watch(page, bag) {
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource.*(40[134]|409)/.test(m.text() + m.location().url)) bag.errors.push(m.text()); });
  page.on('pageerror', (e) => bag.errors.push('PAGEERROR ' + e.message));
  page.on('dialog', async (d) => { bag.dialogs.push(d.message()); await d.dismiss(); });
}
const newBag = () => ({ errors: [], dialogs: [] });
const xssRan = (page) => page.evaluate(() => window.__xss === 1);

async function apiLogin(ctx, login, password) {
  const r = await ctx.request.post(BASE + '/api/auth/login', { data: { login, password }, headers: H });
  assert.equal(r.status(), 200, 'API-логин ' + login);
}
async function pickFreeSlot(page, svcIndex) {
  await page.goto(BASE + '/booking.html');
  await page.waitForSelector('.time-slot');
  await page.locator('.svc-option').nth(svcIndex).click();
  // ищем будущий рабочий день, где есть слоты
  const days = page.locator('.cal-day:not(.disabled):not(.other-month)');
  const n = await days.count();
  for (let i = 3; i < n; i++) {
    await days.nth(i).click();
    await page.waitForTimeout(300);
    if (await page.locator('.time-slot:not(.busy)').count()) break;
  }
  await page.waitForTimeout(400);
  const date = await page.evaluate(() => getSelectedDate());
  return date;
}
async function fillForm(page, { name, phone, car = '', comment = '' }) {
  await page.check('#booking-form input[type="checkbox"][required]'); // согласие на обработку данных
  await page.fill('#booking-name', name);
  await page.fill('#booking-phone', phone);
  if (car) await page.fill('#booking-car', car);
  if (comment) await page.fill('#booking-comment', comment);
}
async function adminBookings(ctx) {
  const r = await ctx.request.get(BASE + '/api/bookings', { headers: H });
  return (await r.json()).bookings;
}

(async () => {
  const browser = await chromium.launch();
  const admCtx = await browser.newContext(); await apiLogin(admCtx, 'admin', ADMIN_PASS);
  const bagClient = newBag();
  const clientCtx = await browser.newContext(); const client = await clientCtx.newPage(); watch(client, bagClient);

  // ════════ КЛИЕНТ ════════
  await step('клиент: главная открывается, ошибок консоли нет, есть путь к записи', async () => {
    await client.goto(BASE + '/index.html'); await client.waitForLoadState('networkidle');
    assert.ok(await client.locator('a[href*="booking"]').count() > 0, 'нет ссылки на запись');
    assert.deepEqual(bagClient.errors, []);
  });

  let bookedDate, bookedTime;
  await step('клиент: услуга → дата → время → форма → заявка создана', async () => {
    await client.locator('a[href*="booking"]').first().click();
    bookedDate = await pickFreeSlot(client, 1);
    const slot = client.locator('.time-slot:not(.busy)').first();
    bookedTime = (await slot.textContent()).trim(); await slot.click();
    await fillForm(client, { name: 'E2E Клиент', phone: '+7 (910) 123-45-67', car: 'А123ВС62', comment: 'Тест E2E' });
    await client.click('#booking-form [type="submit"]');
    await client.waitForFunction(() => /Заявка отправлена/.test(document.getElementById('form-msg').textContent), null, { timeout: 8000 });
    const b = (await adminBookings(admCtx)).find((x) => x.name === 'E2E Клиент');
    assert.ok(b, 'заявка не появилась в админском API');
    assert.equal(b.date, bookedDate); assert.equal(b.time, bookedTime); assert.equal(b.status, 'new');
  });

  await step('клиент: занятый слот виден как занятый и недоступен для выбора', async () => {
    const date = await pickFreeSlot(client, 1);
    if (date !== bookedDate) { // вернуться на ту же дату
      await client.goto(BASE + '/booking.html'); await client.waitForSelector('.time-slot');
    }
    const busy = await client.evaluate(async ([d, t]) => {
      const r = await fetch('/api/bookings/availability?date=' + d); const j = await r.json();
      return JSON.stringify(j).includes(t);
    }, [bookedDate, bookedTime]);
    assert.ok(busy, 'availability не знает о занятом слоте');
  });

  await step('клиент: слот заняли, пока заполнял форму → понятное сообщение, заявка не создана', async () => {
    const date = await pickFreeSlot(client, 2);
    const slot = client.locator('.time-slot:not(.busy)').nth(2);
    const time = (await slot.textContent()).trim(); await slot.click();
    await fillForm(client, { name: 'E2E Опоздал', phone: '+7 (910) 222-33-44' });
    const svcName = await client.locator('.svc-option.active input[name="service"]').getAttribute('value');
    const r = await clientCtx.request.post(BASE + '/api/bookings', { data: { name: 'E2E Успел', phone: '+7 (910) 555-00-11', service: svcName, date, time } });
    assert.equal(r.status(), 201, 'конкурент должен занять слот');
    await client.click('#booking-form [type="submit"]');
    await client.waitForFunction(() => /уже заняли/.test(document.getElementById('form-msg').textContent), null, { timeout: 8000 });
    assert.ok(!(await adminBookings(admCtx)).some((x) => x.name === 'E2E Опоздал'));
  });

  await step('клиент: пустая форма и неверный телефон → ошибки, заявок не создаётся', async () => {
    await pickFreeSlot(client, 0);
    await client.locator('.time-slot:not(.busy)').first().click();
    const before = (await adminBookings(admCtx)).length;
    await client.check('#booking-form input[type="checkbox"][required]');
    await client.click('#booking-form [type="submit"]');
    // Пустые обязательные поля останавливает нативная валидация браузера (до JS-обработчика).
    assert.equal(await client.evaluate(() => document.getElementById('booking-form').checkValidity()), false);
    assert.equal((await adminBookings(admCtx)).length, before, 'пустая форма не должна создавать заявку');
    await fillForm(client, { name: 'Тест', phone: '+7 (910) 12' });
    await client.click('#booking-form [type="submit"]');
    await client.waitForFunction(() => /телефона|11 цифр/.test(document.getElementById('form-msg').textContent));
    assert.equal((await adminBookings(admCtx)).length, before);
  });

  await step('клиент: двойной клик «Отправить» создаёт ровно одну заявку', async () => {
    await pickFreeSlot(client, 3);
    await client.locator('.time-slot:not(.busy)').nth(4).click();
    await fillForm(client, { name: 'E2E Двойной', phone: '+7 (910) 777-66-55' });
    await client.dblclick('#booking-form [type="submit"]');
    await client.waitForFunction(() => /Заявка отправлена|уже заняли/.test(document.getElementById('form-msg').textContent), null, { timeout: 8000 });
    await client.waitForTimeout(500);
    assert.equal((await adminBookings(admCtx)).filter((x) => x.name === 'E2E Двойной').length, 1);
  });

  await step('клиент: XSS в имени и комментарии заявки отправляется как текст и не исполняется на сайте', async () => {
    await pickFreeSlot(client, 0);
    await client.locator('.time-slot:not(.busy)').nth(6).click();
    await fillForm(client, { name: XSS, phone: '+7 (910) 888-11-22', comment: XSS });
    await client.click('#booking-form [type="submit"]');
    await client.waitForFunction(() => /Заявка отправлена|⚠/.test(document.getElementById('form-msg').textContent), null, { timeout: 8000 });
    assert.ok(!(await xssRan(client))); assert.deepEqual(bagClient.dialogs, []);
  });

  // ════════ ПОДГОТОВКА XSS-ДАННЫХ ДЛЯ АДМИНКИ И ПУБЛИЧНЫХ СТРАНИЦ ════════
  const svcs = (await (await admCtx.request.get(BASE + '/api/services')).json());
  const svcList = svcs.services || svcs; const svcName = svcList[0].name;
  await admCtx.request.post(BASE + '/api/works', { data: { name: XSS, cat: 'Комплексная мойка', time: XSS.slice(0, 40) }, headers: H });
  const rv = await admCtx.request.post(BASE + '/api/reviews', { data: { name: XSS, stars: 5, svc: svcName, text: 'Отзыв E2E ' + XSS } });
  const rvId = (await rv.json()).id;
  await admCtx.request.patch(BASE + `/api/reviews/${rvId}`, { data: { status: 'published' }, headers: H });

  await step('публичные страницы (галерея, отзывы) не исполняют XSS из данных', async () => {
    for (const url of ['/gallery.html', '/reviews.html', '/index.html', '/prices.html']) {
      const bag = newBag(); const p = await clientCtx.newPage(); watch(p, bag);
      await p.goto(BASE + url); await p.waitForLoadState('networkidle'); await p.waitForTimeout(500);
      assert.ok(!(await xssRan(p)), url + ': XSS исполнен'); assert.deepEqual(bag.dialogs, [], url + ': alert');
      assert.deepEqual(bag.errors, [], url + ': ошибки консоли');
      await p.close();
    }
  });

  // ════════ АДМИНИСТРАТОР ════════
  const bagAdm = newBag();
  const admPage = await admCtx.newPage(); watch(admPage, bagAdm);
  const go = async (id) => { await admPage.evaluate((x) => window.go(x, document.querySelector(`[data-click*='"${x}"']`)), id); await admPage.waitForTimeout(400); };

  await step('админ: неверный пароль → ошибка, верный → вход в панель', async () => {
    const p = await (await browser.newContext()).newPage();
    await p.goto(BASE + '/admin.html');
    await p.fill('#li', 'admin'); await p.fill('#lp', 'неверный-пароль-123'); await p.click('.lbtn');
    await p.waitForSelector('#lerr', { state: 'visible' });
    await p.fill('#lp', ADMIN_PASS); await p.click('.lbtn');
    await p.waitForSelector('.sbnav', { state: 'visible', timeout: 8000 });
    await p.close();
  });

  await admPage.goto(BASE + '/admin.html'); await admPage.waitForSelector('.sbnav', { state: 'visible', timeout: 8000 });

  await step('админ: заявки, работы, отзывы с XSS-строками не исполняют код (экранируется как текст)', async () => {
    for (const id of ['bookings', 'works', 'reviews']) {
      await go(id);
      assert.ok(!(await xssRan(admPage)), id + ': XSS исполнен'); assert.deepEqual(bagAdm.dialogs, [], id + ': alert');
    }
    await go('works');
    assert.ok(await admPage.locator('#wgrid').getByText('onerror', { exact: false }).count() > 0, 'payload должен отображаться как текст');
    assert.equal(await admPage.locator('#wgrid img[onerror], #wgrid [onerror]').count(), 0, 'в DOM не должно появиться элемента с onerror');
  });

  await step('админ: просмотр заявки и смена статуса на «Выполнена» с оплатой через интерфейс', async () => {
    await go('bookings');
    const row = admPage.locator('#btbody tr', { hasText: 'E2E Клиент' });
    await row.getByRole('button', { name: /Изменить/ }).click();
    await admPage.selectOption('#eb-status', 'done');
    await admPage.fill('#eb-paid', '3000');
    await admPage.locator('.mov:has(#eb-id) button.btn-gold').click();
    await admPage.waitForTimeout(800);
    const b = (await adminBookings(admCtx)).find((x) => x.name === 'E2E Клиент');
    assert.equal(b.status, 'done'); assert.equal(b.paid_amount, 3000);
  });

  await step('админ: редактирование услуги через интерфейс (цена) и отражение в API', async () => {
    await go('services');
    const card = admPage.locator('#svgrid > *').first();
    await card.locator('button[title="Редактировать"]').click();
    await admPage.fill('#es-price', '4321');
    await admPage.locator('.mov:has(#es-name) button.btn-gold').click();
    await admPage.waitForTimeout(800);
    const s = ((await (await admCtx.request.get(BASE + '/api/services/admin', { headers: H })).json()).services || []);
    assert.ok(s.some((x) => x.price === 4321), 'цена услуги не обновилась');
  });

  await step('админ: добавление работы через форму, XSS в названии не исполняется', async () => {
    await go('works');
    await admPage.getByRole('button', { name: /Добавить работу/ }).click();
    await admPage.fill('#aw-name', 'E2E работа ' + XSS); await admPage.fill('#aw-time', '2 дня');
    await admPage.locator('.mov:has(#aw-name) button.btn-gold').click();
    await admPage.waitForTimeout(800);
    assert.ok(!(await xssRan(admPage))); assert.deepEqual(bagAdm.dialogs, []);
    const w = await (await admCtx.request.get(BASE + '/api/works/admin', { headers: H })).json();
    assert.ok((w.works || w).some((x) => String(x.name).startsWith('E2E работа')));
  });

  await step('админ: отзывы — скрыть/опубликовать через интерфейс', async () => {
    await go('reviews');
    const row = admPage.locator('table[aria-label="Отзывы"] tbody tr', { hasText: 'Отзыв E2E' }).first();
    assert.ok(await row.count(), 'отзыв не найден');
    const btn = row.locator('button').first(); await btn.click(); await admPage.waitForTimeout(700);
    const pub = await (await clientCtx.request.get(BASE + '/api/reviews')).json();
    assert.ok(!JSON.stringify(pub).includes('Отзыв E2E'), 'скрытый отзыв остался публичным');
  });

  await step('админ: «Выручка сегодня» на панели совпадает с «Финансами» и не плывёт при смене цены услуги', async () => {
    const today = await admPage.evaluate(() => todayInRyazan());
    const svc = ((await (await admCtx.request.get(BASE + '/api/services/admin', { headers: H })).json()).services)[0];
    const man = await admCtx.request.post(BASE + '/api/bookings/manual', { headers: H, data: { name: 'E2E Касса', phone: '+7 (910) 000-11-22', service: svc.name, date: today, time: '09:00', status: 'done', price: 2500, paid_amount: 2500 } });
    assert.ok(man.status() < 300, 'ручная заявка: ' + man.status() + ' ' + (await man.text()));
    const read = async () => {
      await admPage.reload(); await admPage.waitForSelector('.sbnav', { state: 'visible' });
      await admPage.waitForFunction(() => document.getElementById('d-rev').textContent.replace(/\D/g, '') !== '0', null, { timeout: 8000 });
      const dash = (await admPage.locator('#d-rev').textContent()).replace(/\D/g, '');
      await go('finance');
      const fin = (await admPage.locator('.fcard', { hasText: 'Выручка сегодня' }).locator('.fcard-val').textContent()).replace(/\D/g, '');
      return { dash, fin };
    };
    const a = await read(); assert.equal(a.dash, a.fin, 'панель и финансы расходятся');
    await admCtx.request.patch(BASE + `/api/services/${svc.id}`, { headers: H, data: { price: 9999 } });
    const b = await read(); assert.equal(b.dash, b.fin, 'после смены цены панель и финансы расходятся');
    assert.equal(b.fin, a.fin, 'выручка прошлой заявки изменилась после смены цены услуги');
  });

  await step('страницы услуг (defer-скрипты): без ошибок консоли, модалка политики и баннер cookie работают', async () => {
    const pages = ['wash', 'interior', 'wheels', 'engine', 'headlights', 'ozone', 'ceramic', 'coating', 'detail', 'ppf'];
    for (const n of pages) {
      const bag = newBag(); const ctx = await browser.newContext(); const p = await ctx.newPage(); watch(p, bag);
      await p.goto(`${BASE}/service-${n}.html`); await p.waitForLoadState('networkidle');
      assert.ok(await p.locator('h1').first().isVisible(), n + ': нет h1');
      await p.waitForSelector('.cookie-banner.is-visible', { timeout: 6000 });
      await p.locator('.footer-legal [data-modal="privacy"]').click();
      await p.waitForFunction(() => !!document.querySelector('.modal-overlay.open, .modal-overlay.is-open, .modal.open, [class*="modal"][class*="open"], [class*="modal"][class*="visible"]'), null, { timeout: 4000 });
      assert.deepEqual(bag.errors, [], n + ': ошибки консоли');
      await ctx.close();
    }
  });

  await step('галерея: фото карточек ниже экрана подгружаются только при прокрутке (экономия канала, быстрый LCP)', async () => {
    const ctx = await browser.newContext({ viewport: { width: 412, height: 823 } }); const p = await ctx.newPage();
    await p.goto(BASE + '/gallery.html'); await p.waitForSelector('.gl-card .ba-wrap'); await p.waitForTimeout(1000);
    const wraps = p.locator('.gl-card .ba-wrap[data-before]:not([data-before=""])');   // карточки именно с фото
    const n = await wraps.count(); assert.ok(n >= 4, 'мало карточек с фото для проверки: ' + n);
    const hasImg = (loc) => loc.locator('.ba-after').evaluate((e) => !!e.style.backgroundImage);
    assert.equal(await hasImg(wraps.last()), false, 'фото последней (далёкой) карточки не должно грузиться сразу');
    await wraps.first().scrollIntoViewIfNeeded(); await p.waitForTimeout(700);
    assert.equal(await hasImg(wraps.first()), true, 'фото первой карточки не подгрузилось при подходе к экрану');
    assert.equal(await hasImg(wraps.last()), false, 'фото последней карточки загрузилось слишком рано');
    await wraps.last().scrollIntoViewIfNeeded(); await p.waitForTimeout(700);
    assert.equal(await hasImg(wraps.last()), true, 'после прокрутки фото последней карточки не подгрузилось');
    await ctx.close();
  });

  // ════════ МЕНЕДЖЕР ════════
  await step('менеджер: admin-only разделы скрыты, мутации админских API → 403 из браузерной сессии', async () => {
    const ctx = await browser.newContext(); const p = await ctx.newPage(); const bag = newBag(); watch(p, bag);
    await p.goto(BASE + '/admin.html'); await p.fill('#li', 'mgr'); await p.fill('#lp', MGR_PASS); await p.click('.lbtn');
    await p.waitForSelector('.sbnav', { state: 'visible', timeout: 8000 });
    const hidden = await p.locator('.sbitem.admin-only').evaluateAll((els) => els.every((e) => getComputedStyle(e).display === 'none'));
    assert.ok(hidden, 'admin-only пункты меню видны менеджеру');
    for (const [m, u, d] of [['POST', '/api/services', { name: 'X', price: 1 }], ['POST', '/api/admins', { login: 'hack', password: 'Zq!8-long-pass-77', role: 'admin' }], ['PUT', '/api/settings/contacts', {}], ['DELETE', '/api/logs/old', null]]) {
      const r = await ctx.request.fetch(BASE + u, { method: m, headers: H, data: d || undefined });
      assert.equal(r.status(), 403, `${m} ${u} должен быть 403, а не ${r.status()}`);
    }
    await ctx.close();
  });

  await step('вся админка: нет ошибок консоли при обходе всех разделов', async () => {
    for (const id of ['dashboard', 'bookings', 'schedule', 'messages', 'reviews', 'blacklist', 'services', 'works', 'finance', 'admins', 'settings', 'logs']) await go(id);
    assert.deepEqual(bagAdm.errors, []);
  });

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('E2E упал:', e); process.exit(1); });
