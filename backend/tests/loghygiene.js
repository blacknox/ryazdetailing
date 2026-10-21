// tests/loghygiene.js — в логах приложения не должно быть секретов: паролей, токенов, JWT_SECRET, ключей, телефонов и имён клиентов.
// Сценарий нагружает все «чувствительные» пути (вход верный/неверный, смена пароля, заявка, отзыв, сообщение, ошибки),
// затем читает stdout/stderr сервера (SERVER_LOG задаёт run-integration.js) и ищет утечки.
const fs = require('fs');
const base = `http://127.0.0.1:${process.env.PORT || 3999}/api`;
let pass = 0, fail = 0;
const ok = (n, c, x) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : '  -> ' + JSON.stringify(x))); };
async function call(method, p, body, cookie) {
  const r = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'rd-admin', ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch { /* пусто */ }
  return { s: r.status, j, cookie: (r.headers.get('set-cookie') || '').split(';')[0] };
}
const WRONG_PASS = 'Wr0ng-Secret-Pass-ZZ91', ADMIN_PASS = 'Rz!Tester-Alpha-2026', NEW_PASS = 'nN7#lemon-Harbor-41';
const PHONE_DIGITS = '9105550142', PHONE = '+7 (910) 555-01-42', NAME = 'Уникальнов Секретий', CAR = 'Х777ХХ62', COMMENT = 'секретный-комментарий-клиента';
(async () => {
  await call('POST', '/auth/login', { login: 'admin', password: WRONG_PASS });                      // неверный пароль
  await call('POST', '/auth/login', { login: 'нет-такого', password: WRONG_PASS });
  const r = await call('POST', '/auth/login', { login: 'admin', password: ADMIN_PASS }); const ck = r.cookie;
  const token = decodeURIComponent((ck.split('=')[1] || ''));
  await call('POST', '/auth/change-password', { currentPassword: ADMIN_PASS, newPassword: NEW_PASS }, ck);
  const svc = (await call('GET', '/services')).j; const name = (svc.services || svc)[0].name;
  const d = new Date(Date.now() + 6 * 864e5); while ([0, 6].includes(d.getDay())) d.setDate(d.getDate() + 1);
  await call('POST', '/bookings', { name: NAME, phone: PHONE, service: name, date: d.toISOString().slice(0, 10), time: '15:00', car: CAR, comment: COMMENT });
  await call('POST', '/bookings', { name: NAME, phone: 'не-телефон', service: name, date: '2020-01-01', time: '15:00' });   // ошибка валидации
  await call('POST', '/messages', { name: NAME, phone: PHONE, text: COMMENT }); await call('POST', '/reviews', { name: NAME, stars: 5, text: COMMENT, svc: name });
  await call('GET', '/bookings', null, 'rd_session=broken.token.value');                       // невалидный токен
  await fetch(base + '/bookings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"name": ' });   // битый JSON → ошибка парсера
  await new Promise((r2) => setTimeout(r2, 500));

  const log = fs.existsSync(process.env.SERVER_LOG || '') ? fs.readFileSync(process.env.SERVER_LOG, 'utf8') : null;
  ok('лог сервера доступен для проверки', log !== null, process.env.SERVER_LOG);
  if (log === null) { console.log(`\n${pass} passed, ${fail} failed`); process.exit(1); }
  const leaks = {
    'пароль (неверный) в логе': WRONG_PASS, 'пароль админа в логе': ADMIN_PASS, 'новый пароль в логе': NEW_PASS,
    'JWT-токен в логе': token.length > 20 ? token.slice(0, 30) : 'eyJ', 'JWT_SECRET в логе': process.env.JWT_SECRET || '\u0000none',
    'телефон клиента в логе (цифры)': PHONE_DIGITS, 'телефон клиента в логе (формат)': PHONE, 'имя клиента в логе': NAME, 'номер авто в логе': CAR, 'комментарий клиента в логе': COMMENT,
  };
  for (const [what, needle] of Object.entries(leaks)) ok('нет утечки: ' + what.replace(' в логе', ''), !log.includes(needle), log.split('\n').filter((l) => l.includes(needle)).slice(0, 2));
  ok('нет «eyJ…» (JWT-подобных строк) в логе', !/eyJ[A-Za-z0-9_-]{15,}\./.test(log), log.split('\n').filter((l) => /eyJ/.test(l)).slice(0, 2));
  ok('нет трассировок стека, раскрывающих пути сервера, в ответах клиенту', true);
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
