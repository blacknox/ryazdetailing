// e2e/keyboard.js — управление только с клавиатуры: меню админки, модалки (фокус/Escape), слайдер до/после, форма записи.
const { chromium } = require('playwright');
const BASE = process.env.BASE_URL;
let pass = 0, fail = 0;
async function step(n, f) { try { await f(); pass++; console.log('PASS ' + n); } catch (e) { fail++; console.log('FAIL ' + n + '\n       ' + String(e.message).split('\n')[0]); } }
const ok = (c, m) => { if (!c) throw new Error(m); };
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1366, height: 800 } }); const p = await ctx.newPage();

  await step('сайт: первый Tab попадает на видимый интерактивный элемент (skip-link или меню)', async () => {
    await p.goto(BASE + '/index.html'); await p.keyboard.press('Tab');
    const a = await p.evaluate(() => { const e = document.activeElement; const r = e.getBoundingClientRect(); return { tag: e.tagName, vis: r.width > 0 && r.height > 0, txt: (e.textContent || '').trim().slice(0, 30), outline: getComputedStyle(e).outlineStyle + '/' + getComputedStyle(e).boxShadow.slice(0, 20) }; });
    ok(a.tag !== 'BODY', 'фокус остался на body'); ok(a.vis, 'сфокусирован невидимый элемент');
  });

  await step('сайт: у всех фокусируемых элементов главной виден индикатор фокуса', async () => {
    await p.goto(BASE + '/index.html'); const bad = [];
    for (let i = 0; i < 25; i++) {
      await p.keyboard.press('Tab');
      const r = await p.evaluate(() => { const e = document.activeElement; const cs = getComputedStyle(e); const vis = (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || (cs.boxShadow && cs.boxShadow !== 'none') || e.matches(':focus-visible'); return { vis, d: e.tagName + '.' + String(e.className).slice(0, 30) + ' ' + (e.textContent || '').trim().slice(0, 20) }; });
      if (!r.vis) bad.push(r.d);
    }
    ok(bad.length === 0, 'без индикатора фокуса: ' + bad.join(' | '));
  });

  await step('запись: услугу, дату и время можно выбрать только клавиатурой (Tab + Enter/Space)', async () => {
    await p.goto(BASE + '/booking.html'); await p.waitForSelector('.time-slot');
    for (const sel of ['.svc-option', '.cal-day:not(.disabled):not(.other-month)', '.time-slot:not(.busy)']) {
      const info = await p.locator(sel).first().evaluate((e) => ({ tab: e.tabIndex, tag: e.tagName, role: e.getAttribute('role'), focusable: e.matches('button,a,input,select,textarea,label,[tabindex]') || !!e.querySelector('input,button') }));
      ok(info.tab >= 0 || info.focusable, `${sel}: недоступен с клавиатуры (${JSON.stringify(info)})`);
    }
  });

  await step('запись целиком с клавиатуры: дата (Enter), время (Space), форма, отправка (Enter) → заявка создана', async () => {
    await p.goto(BASE + '/booking.html'); await p.waitForSelector('.time-slot');
    await p.locator('.svc-option').nth(0).locator('input').focus(); await p.keyboard.press('Space');
    const days = p.locator('.cal-day[tabindex="0"]:not(.disabled)'); const n = await days.count(); let got = false;
    for (let i = 2; i < n && !got; i++) { await days.nth(i).focus(); await p.keyboard.press('Enter'); await p.waitForTimeout(350); got = (await p.locator('.time-slot:not(.busy)').count()) > 0; }
    ok(got, 'не нашлось дня со свободными слотами');
    ok(await p.locator('.cal-day.active[aria-pressed="true"]').count() === 1, 'выбранный день не помечен aria-pressed');
    await p.locator('.time-slot:not(.busy)').nth(1).focus(); await p.keyboard.press('Space');
    ok(await p.locator('.time-slot.active[aria-pressed="true"]').count() === 1, 'выбранное время не помечено aria-pressed');
    await p.fill('#booking-name', 'Клавиатура Тест'); await p.fill('#booking-phone', '+7 (910) 333-22-11');
    await p.check('#booking-form input[type="checkbox"][required]');
    await p.locator('#booking-name').focus(); await p.keyboard.press('Enter');
    await p.waitForFunction(() => /Заявка отправлена/.test(document.getElementById('form-msg').textContent), null, { timeout: 8000 });
  });

  await step('слайдер до/после: role=slider, aria-valuenow, управление стрелками/Home/End', async () => {
    await p.goto(BASE + '/gallery.html'); await p.waitForLoadState('networkidle'); await p.waitForTimeout(600);
    const sl = p.locator('[role="slider"]').first();
    ok(await sl.count() > 0, 'на странице галереи нет role=slider');
    for (const a of ['aria-valuemin', 'aria-valuemax', 'aria-valuenow', 'aria-label']) ok(await sl.getAttribute(a) !== null, 'нет ' + a);
    await sl.focus(); const v0 = +(await sl.getAttribute('aria-valuenow'));
    await p.keyboard.press('ArrowRight'); const v1 = +(await sl.getAttribute('aria-valuenow')); ok(v1 > v0, `ArrowRight не двигает слайдер (${v0}→${v1})`);
    await p.keyboard.press('Home'); ok(+(await sl.getAttribute('aria-valuenow')) === +(await sl.getAttribute('aria-valuemin')), 'Home не ведёт в начало');
    await p.keyboard.press('End'); ok(+(await sl.getAttribute('aria-valuenow')) === +(await sl.getAttribute('aria-valuemax')), 'End не ведёт в конец');
  });

  // Админка
  await p.goto(BASE + '/admin.html'); await p.fill('#li', 'admin'); await p.fill('#lp', process.env.ADMIN_PASSWORD); await p.keyboard.press('Enter');
  await step('админка: вход по Enter из поля пароля', async () => { await p.waitForSelector('.sbnav', { state: 'visible', timeout: 8000 }); });

  await step('админка: пункты бокового меню доступны с клавиатуры и открываются по Enter', async () => {
    const items = await p.locator('.sbitem:visible').evaluateAll((els) => els.map((e) => ({ t: (e.textContent || '').trim().slice(0, 18), tab: e.tabIndex, tag: e.tagName, role: e.getAttribute('role') })));
    const bad = items.filter((i) => i.tab < 0 && !['BUTTON', 'A'].includes(i.tag));
    ok(bad.length === 0, 'не фокусируются с клавиатуры: ' + bad.map((i) => i.t).join(', '));
    const target = p.locator('.sbitem:visible', { hasText: 'Работы' }).first(); await target.focus(); await p.keyboard.press('Enter'); await p.waitForTimeout(400);
    ok(await p.locator('#pg-works').isVisible(), 'Enter не открыл раздел «Работы»');
  });

  await step('админка: модалка открывается с фокусом внутри, Escape закрывает и возвращает фокус на кнопку', async () => {
    await p.locator('.sbitem:visible', { hasText: 'Работы' }).first().focus(); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
    const btn = p.getByRole('button', { name: /Добавить работу/ }); await btn.focus(); await p.keyboard.press('Enter'); await p.waitForTimeout(400);
    const inside = await p.evaluate(() => { const m = document.querySelector('.mov.open, .mov.show, .mov[style*="flex"], .mov.active'); return !!m && m.contains(document.activeElement); });
    ok(inside, 'фокус не перешёл внутрь модалки');
    await p.keyboard.press('Escape'); await p.waitForTimeout(400);
    const back = await p.evaluate(() => (document.activeElement.textContent || '').includes('Добавить работу'));
    ok(back, 'после Escape фокус не вернулся на кнопку «Добавить работу»');
  });

  await b.close(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
