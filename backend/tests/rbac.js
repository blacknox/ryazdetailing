// tests/rbac.js — матрица прав (аноним / менеджер / админ) по всем защищённым маршрутам
// и тест гонки при бронировании одного слота. Запускается через `npm run test:integration`.
const base = `http://127.0.0.1:${process.env.PORT || 3999}/api`;
let pass = 0, fail = 0;
const ok = (n, c, x) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : '  -> ' + JSON.stringify(x))); };

async function call(method, p, body, cookie) {
  const r = await fetch(base + p, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'rd-admin', ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let j = null; try { j = await r.json(); } catch { /* пустое тело */ }
  return { s: r.status, j, cookie: (r.headers.get('set-cookie') || '').split(';')[0] };
}

// [метод, путь, кто допущен]: 'admin' — только админ, 'staff' — админ и менеджер.
const ID = 999999;
const PROTECTED = [
  ['GET', '/bookings', 'staff'], ['PATCH', `/bookings/${ID}`, 'staff'], ['POST', '/bookings/manual', 'staff'],
  ['GET', '/messages', 'staff'], ['PATCH', `/messages/${ID}`, 'staff'], ['DELETE', `/messages/${ID}`, 'admin'],
  ['GET', '/reviews/admin', 'staff'], ['POST', '/reviews/manual', 'staff'], ['PATCH', `/reviews/${ID}`, 'staff'], ['DELETE', `/reviews/${ID}`, 'admin'],
  ['GET', '/services/admin', 'staff'], ['POST', '/services', 'admin'], ['PATCH', `/services/${ID}`, 'admin'], ['DELETE', `/services/${ID}`, 'admin'],
  ['GET', '/works/admin', 'staff'], ['POST', '/works', 'staff'], ['PATCH', `/works/${ID}`, 'staff'], ['DELETE', `/works/${ID}`, 'admin'],
  ['PUT', '/settings/contacts', 'admin'],
  ['GET', '/admins', 'admin'], ['POST', '/admins', 'admin'], ['PATCH', `/admins/${ID}`, 'admin'], ['DELETE', `/admins/${ID}`, 'admin'],
  ['GET', '/blacklist', 'staff'], ['POST', '/blacklist', 'admin'], ['DELETE', `/blacklist/${ID}`, 'admin'],
  ['GET', '/logs', 'admin'], ['DELETE', '/logs/old', 'admin'],
  ['GET', '/system/status', 'admin'],
  ['GET', '/auth/me', 'staff'], ['POST', '/auth/change-password', 'staff'],
];

(async () => {
  let r = await call('POST', '/auth/login', { login: 'admin', password: 'Rz!Tester-Alpha-2026' });
  const adminCookie = r.cookie; ok('admin login', !!adminCookie, r);
  r = await call('POST', '/auth/login', { login: 'mgr', password: 'Rz!Tester-Beta-2026' });
  const mgrCookie = r.cookie; ok('manager login', !!mgrCookie, r);

  for (const [m, p, who] of PROTECTED) {
    const tag = `${m} ${p}`;
    r = await call(m, p, m === 'GET' || m === 'DELETE' ? null : {});
    ok(`аноним → 401: ${tag}`, r.s === 401, r.s);
    r = await call(m, p, m === 'GET' || m === 'DELETE' ? null : {}, mgrCookie);
    if (who === 'admin') ok(`менеджер → 403: ${tag}`, r.s === 403, r.s);
    else ok(`менеджер допущен (не 401/403): ${tag}`, r.s !== 401 && r.s !== 403, r.s);
    r = await call(m, p, m === 'GET' || m === 'DELETE' ? null : {}, adminCookie);
    ok(`админ допущен (не 401/403): ${tag}`, r.s !== 401 && r.s !== 403, r.s);
  }

  // Приватные ответы не должны кешироваться.
  const priv = await fetch(base + '/bookings', { headers: { Cookie: adminCookie, 'X-Requested-With': 'rd-admin' } });
  ok('приватные ответы админки: Cache-Control: no-store', (priv.headers.get('cache-control') || '').includes('no-store'), priv.headers.get('cache-control'));
  // Cookie сессии за HTTPS-прокси получает флаг Secure.
  const sec = await fetch(base + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'rd-admin', 'X-Forwarded-Proto': 'https' }, body: JSON.stringify({ login: 'admin', password: 'Rz!Tester-Alpha-2026' }) });
  const sc = sec.headers.get('set-cookie') || '';
  ok('cookie за HTTPS-прокси: HttpOnly + Secure + SameSite=Strict', /HttpOnly/i.test(sc) && /SameSite=Strict/i.test(sc) && /;\s*Secure/i.test(sc), sc);

  // Мутации без заголовка X-Requested-With (CSRF) должны отклоняться, даже с валидной сессией.
  const raw = await fetch(base + '/services', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ name: 'CSRF', price: 1 }) });
  ok('мутация без X-Requested-With отклонена (CSRF)', raw.status === 403 || raw.status === 401, raw.status);

  // ── Гонка: два одновременных запроса на один и тот же слот ──
  const svcs = await call('GET', '/services');
  const svcName = svcs.j && (svcs.j.services || svcs.j)[0].name;
  const d = new Date(Date.now() + 5 * 864e5); while ([0, 6].includes(d.getDay())) d.setDate(d.getDate() + 1);
  const date = d.toISOString().slice(0, 10);
  const mk = (n) => call('POST', '/bookings', { name: 'Гонка ' + n, phone: `+7 (910) 600-00-0${n}`, service: svcName, date, time: '11:00' });
  const res = await Promise.all([mk(1), mk(2)]);
  const created = res.filter((x) => x.s === 201).length;
  ok('гонка: на один слот создана ровно одна запись', created === 1, res.map((x) => x.s));
  ok('гонка: вторая запись получила отказ 409/400', res.some((x) => x.s === 409 || x.s === 400), res.map((x) => x.s));

  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
