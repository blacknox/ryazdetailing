// tests/security.js — журнал «было → стало» и прогрессивная блокировка входа.
// Запуск на ЧИСТОЙ временной копии бэкенда (как tests/integration.js): задайте JWT_SECRET (32+ симв.),
// ADMIN_LOGIN=admin, ADMIN_PASSWORD=Rz!Tester-Alpha-2026, PORT=3999, запустите `node server.js`,
// затем из той же папки `node tests/security.js`. Тест ПОСЛЕДНИМ шагом блокирует вход с вашего IP на время.
const base = `http://127.0.0.1:${process.env.PORT || 3999}/api`;
let pass = 0, fail = 0;
const ok = (n, c, x) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : '  -> ' + JSON.stringify(x))); };
async function call(m, p, b, cookie) {
  const r = await fetch(base + p, { method: m, headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'rd-admin', ...(cookie ? { Cookie: cookie } : {}) }, body: b ? JSON.stringify(b) : undefined });
  let j = null; try { j = await r.json(); } catch {}
  return { s: r.status, j, h: r.headers };
}
(async () => {
  let r = await call('POST', '/auth/login', { login: 'admin', password: 'Rz!Tester-Alpha-2026' });
  const ck = r.h.getSetCookie().map((x) => x.split(';')[0]).join('; ');
  ok('admin login', r.s === 200 && ck, r);
  const logs = async () => (await call('GET', '/logs', null, ck)).j.logs;

  // --- журнал: услуга ---
  r = await call('POST', '/services', { name: 'Аудит-тест', price: 1200 }, ck);
  const svc = r.j.service;
  await call('PATCH', '/services/' + svc.id, { price: 1500, name: 'Аудит-тест 2' }, ck);
  let l = (await logs()).find((x) => x.action === 'Изменена цена услуги');
  ok('услуга: цена было → стало', l && l.changes && l.changes.price && l.changes.price[0] === '1200' && l.changes.price[1] === '1500', l);
  ok('услуга: имя было → стало', l && l.changes.name && l.changes.name[1] === 'Аудит-тест 2', l);
  ok('услуга: неизменённые поля не пишутся', l && !l.changes.dur && !l.changes.active, l);
  await call('DELETE', '/services/' + svc.id, null, ck);
  l = (await logs()).find((x) => x.action === 'Удалена услуга');
  ok('удаление хранит снимок удалённого', l && l.changes && l.changes.name && l.changes.name[0] === 'Аудит-тест 2' && l.changes.name[1] === null, l);

  // --- журнал: настройки ---
  await call('PUT', '/settings/site_content', { value: { zz_test: 'a' } }, ck);
  await call('PUT', '/settings/site_content', { value: { zz_test: 'b' } }, ck);
  l = (await logs()).find((x) => x.action.startsWith('Изменены настройки') && x.changes && x.changes.zz_test && x.changes.zz_test[1] === 'b');
  ok('настройки: поле было → стало', l && l.changes.zz_test[0] === 'a', l);

  // --- журнал не содержит секретов ---
  await call('POST', '/admins', { login: 'tmpadmin', password: 'Secret-Password-1', role: 'manager' }, ck);
  const dump = JSON.stringify(await logs());
  ok('в журнале нет паролей и хэшей', !/Secret-Password-1|\$2[aby]\$/.test(dump));

  // --- блокировка входа ---
  const codes = [];
  for (let i = 0; i < 5; i++) codes.push((await call('POST', '/auth/login', { login: 'admin', password: 'wrong-' + i })).s);
  ok('5 неверных паролей → 401', codes.every((c) => c === 401), codes);
  r = await call('POST', '/auth/login', { login: 'admin', password: 'wrong-6' });
  ok('6-я попытка → 429 + Retry-After', r.s === 429 && Number(r.h.get('retry-after')) >= 55, { s: r.s, ra: r.h.get('retry-after') });
  r = await call('POST', '/auth/login', { login: 'admin', password: 'Rz!Tester-Alpha-2026' });
  ok('верный пароль во время блокировки тоже отклонён', r.s === 429, r);
  r = await call('POST', '/auth/login', { login: 'nobody-' + Date.now(), password: 'x' });
  ok('блокировка по IP действует и на другие логины', r.s === 429, r);
  l = (await logs()).find((x) => x.action === 'Блокировка входа');
  ok('блокировка записана в журнал с IP', l && l.ip && l.admin_login === 'admin', l);
  ok('уже выданная сессия продолжает работать', (await call('GET', '/logs', null, ck)).s === 200);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
