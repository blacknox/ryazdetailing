// tests/password.js — единая password policy при создании и смене пароля.
const base = `http://127.0.0.1:${process.env.PORT || 3999}/api`;
let pass = 0, fail = 0;
const ok = (n, c, x) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : '  -> ' + JSON.stringify(x))); };
async function call(method, p, body, cookie) {
  const r = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'rd-admin', ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch { /* пусто */ }
  return { s: r.status, j, cookie: (r.headers.get('set-cookie') || '').split(';')[0] };
}
const OLD = 'Rz!Tester-Beta-2026', NEW = 'k7#Vq9-lamp-Orbit-52';

(async () => {
  let r = await call('POST', '/auth/login', { login: 'mgr', password: OLD });
  const mgr = r.cookie; ok('manager login', !!mgr, r);

  // ── Смена собственного пароля ──
  const change = (newPassword, currentPassword = OLD) => call('POST', '/auth/change-password', { currentPassword, newPassword }, mgr);
  r = await change('Short-1');                  ok('смена: короткий пароль → 400', r.s === 400, r);
  r = await change('Password-2026-x');          ok('смена: типовой пароль → 400', r.s === 400, r);
  r = await change('замените_на_надёжный_пароль'); ok('смена: шаблонный пароль из .env.example → 400', r.s === 400, r);
  r = await change('aaaaaaaaaaaaaaaa');         ok('смена: один повторяющийся символ → 400', r.s === 400, r);
  r = await change('Ж'.repeat(40) + 'x!7');      ok('смена: длиннее 72 байт (bcrypt обрежет) → 400', r.s === 400, r);
  r = await change(OLD);                        ok('смена: новый = текущему → 400', r.s === 400, r);
  r = await call('POST', '/auth/change-password', { currentPassword: OLD, newPassword: 12345678901234 }, mgr);
  ok('смена: не строка → 400', r.s === 400, r);
  r = await call('POST', '/auth/change-password', { currentPassword: { $ne: 1 }, newPassword: NEW }, mgr);
  ok('смена: currentPassword-объект → 400', r.s === 400, r);
  r = await change(NEW, 'не-тот-пароль-совсем');  ok('смена: неверный текущий → 401', r.s === 401, r);
  // после всех отказов старый пароль ещё работает
  r = await call('POST', '/auth/login', { login: 'mgr', password: OLD }); ok('после отказов старый пароль работает', !!r.cookie, r);

  r = await change(NEW);                        ok('смена: сильный пароль → 200', r.s === 200 && r.j && r.j.ok, r);
  r = await call('POST', '/auth/login', { login: 'mgr', password: OLD }); ok('старый пароль перестал работать (401)', r.s === 401, r);
  r = await call('POST', '/auth/login', { login: 'mgr', password: NEW }); ok('новый пароль работает', !!r.cookie, r);

  // ── Создание и сброс пароля через /admins (только админ) ──
  r = await call('POST', '/auth/login', { login: 'admin', password: 'Rz!Tester-Alpha-2026' });
  const adm = r.cookie; ok('admin login', !!adm, r);
  r = await call('POST', '/admins', { login: 'weak1', password: 'abcd1234', role: 'manager' }, adm);       ok('создание: 8 символов → 400', r.s === 400, r);
  r = await call('POST', '/admins', { login: 'weak2', password: 'Password-2026-x', role: 'manager' }, adm); ok('создание: типовой пароль → 400', r.s === 400, r);
  r = await call('POST', '/admins', { login: 'weak3', password: 123456789012, role: 'manager' }, adm);      ok('создание: пароль не строка → 400', r.s === 400, r);
  r = await call('POST', '/admins', { login: 'strong1', password: 'tU4$wide-Cobalt-77', role: 'manager' }, adm);
  ok('создание: сильный пароль → 201', r.s === 201, r);
  const id = r.j && (r.j.admin ? r.j.admin.id : r.j.id);
  r = await call('PATCH', `/admins/${id}`, { password: 'short' }, adm);          ok('сброс: короткий → 400', r.s === 400, r);
  r = await call('PATCH', `/admins/${id}`, { password: 'Admin-Password-9' }, adm); ok('сброс: типовой → 400', r.s === 400, r);
  r = await call('PATCH', `/admins/${id}`, { password: 'nB5!river-Quartz-31' }, adm); ok('сброс: сильный → 200', r.s === 200, r);
  r = await call('POST', '/auth/login', { login: 'strong1', password: 'tU4$wide-Cobalt-77' }); ok('после сброса прежний пароль не работает', r.s === 401, r);
  r = await call('POST', '/auth/login', { login: 'strong1', password: 'nB5!river-Quartz-31' }); ok('после сброса новый пароль работает', !!r.cookie, r);

  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
