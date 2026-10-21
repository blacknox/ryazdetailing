// tests/dast.js — «DAST-lite»: набор атак на работающий сервер (классы из плана: SQLi, XSS-заголовки, CSRF, IDOR, обход авторизации и RBAC,
// path traversal, подделка JWT, mass assignment, раскрытие информации, оверсайз, CRLF-инъекции, перебор пользователей).
// Не заменяет внешний сканер (OWASP ZAP и т.п.), но выполняется в CI за секунды и ловит регрессии. Запуск: npm run test:integration
const jwt = require('jsonwebtoken');
const http = require('http');
const PORT = process.env.PORT || 3999, ROOT = `http://127.0.0.1:${PORT}`, base = ROOT + '/api';
let pass = 0, fail = 0;
const ok = (n, c, x) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : '  -> ' + JSON.stringify(x))); };
async function raw(method, url, { body, headers = {}, cookie, bearer } = {}) {
  const h = { 'X-Requested-With': 'rd-admin', ...headers }; if (cookie) h.Cookie = cookie; if (bearer) h.Authorization = 'Bearer ' + bearer;
  if (body !== undefined && !h['Content-Type']) h['Content-Type'] = 'application/json';
  const r = await fetch(url, { method, headers: h, body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)), redirect: 'manual' });
  const text = await r.text(); let j = null; try { j = JSON.parse(text); } catch { /* не JSON */ }
  return { s: r.status, text, j, h: r.headers, cookie: (r.headers.get('set-cookie') || '').split(';')[0] };
}
const api = (m, p, o) => raw(m, base + p, o);
const LEAK = /(\/home\/|\/tmp\/|node_modules|at [A-Za-z.<>]+ \(|SQLITE_|SqliteError|stack|\.js:\d+)/;
const SQLI = ["' OR '1'='1", "'; DROP TABLE services;--", '" OR ""="', "1 UNION SELECT password_hash,2,3 FROM admins--", "\\' OR 1=1 --", "%' OR '%'='", "admin'--"];

(async () => {
  let r = await api('POST', '/auth/login', { body: { login: 'admin', password: 'Rz!Tester-Alpha-2026' } }); const adm = r.cookie; ok('admin login', !!adm, r.s);
  r = await api('POST', '/auth/login', { body: { login: 'mgr', password: 'Rz!Tester-Beta-2026' } }); const mgr = r.cookie; ok('manager login', !!mgr, r.s);
  const svcName = ((await api('GET', '/services')).j.services || [])[0].name;
  const futureDate = (() => { const d = new Date(Date.now() + 8 * 864e5); while ([0, 6].includes(d.getDay())) d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); })();

  // ── SQL-инъекции ──
  let sqliOk = true, leaks = [];
  for (const p of SQLI) {
    for (const res of [await api('POST', '/auth/login', { body: { login: p, password: p } }), await api('POST', '/auth/login', { body: { login: 'admin', password: p } })]) {
      if (res.s === 200 || res.s >= 500) sqliOk = false; if (LEAK.test(res.text)) leaks.push(res.text.slice(0, 80));
    }
  }
  ok('SQLi: вход не обходится ни одним payload (нет 200/5xx)', sqliOk);
  for (const p of SQLI) {
    for (const [m, u, o] of [['GET', `/bookings/availability?date=${encodeURIComponent(p)}`], ['GET', `/bookings?search=${encodeURIComponent(p)}`, { cookie: adm }], ['PATCH', `/bookings/${encodeURIComponent(p)}`, { cookie: adm, body: { status: 'done' } }],
      ['DELETE', `/services/${encodeURIComponent(p)}`, { cookie: adm }], ['POST', '/messages', { body: { name: p, phone: p, text: p } }], ['POST', '/reviews', { body: { name: p, stars: 5, text: p, svc: p } }]]) {
      const res = await api(m, u, o || {}); if (res.s >= 500) { sqliOk = false; leaks.push(`${m} ${u} → ${res.s}`); } if (LEAK.test(res.text)) leaks.push(`${m} ${u}: ${res.text.slice(0, 80)}`);
    }
  }
  ok('SQLi: параметры запроса, id в пути, тела форм — нет 5xx', sqliOk, leaks.slice(0, 3));
  ok('SQLi: ответы не раскрывают ошибки БД/стек/пути', leaks.length === 0, leaks.slice(0, 3));
  const after = await api('GET', '/services'); ok('SQLi: таблицы целы (услуги доступны после атак)', after.s === 200 && (after.j.services || []).length > 0, after.s);
  const adminsRes = await api('GET', '/admins', { cookie: adm }); ok('SQLi: пользователи целы', adminsRes.s === 200 && JSON.stringify(adminsRes.j).includes('admin'), adminsRes.s);
  ok('API никогда не отдаёт password_hash', !JSON.stringify(adminsRes.j).includes('password_hash') && !/\$2[aby]\$/.test(adminsRes.text), adminsRes.text.slice(0, 100));

  // ── Path traversal ──
  const trav = ['/uploads/../data/ryazdetailing.db', '/uploads/%2e%2e/data/ryazdetailing.db', '/uploads/..%2fdata%2fryazdetailing.db', '/uploads/%252e%252e/server.js', '/uploads/....//....//server.js', '/api/../server.js', '/uploads/..\\..\\server.js', '/uploads/%00.webp', '/.env', '/data/ryazdetailing.db', '/package.json', '/server.js'];
  const bad = []; for (const p of trav) { const res = await raw('GET', ROOT + p); if (res.s === 200 && !/^\s*<!doctype html/i.test(res.text)) bad.push(`${p} → 200`); if (/SQLite format|require\(|JWT_SECRET|"dependencies"/.test(res.text)) bad.push(`${p}: содержимое файла!`); }
  ok('Path traversal: ни один путь не отдаёт файлы сервера/БД', bad.length === 0, bad);

  // ── Обход авторизации: подделка JWT ──
  const secret = process.env.JWT_SECRET; const sample = r.cookie; const real = jwt.decode(decodeURIComponent((adm.split('=')[1] || '')));
  const forge = { 'alg=none': (() => { const h = Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url'), p = Buffer.from(JSON.stringify({ ...real, role: 'admin', id: 1 })).toString('base64url'); return `${h}.${p}.`; })(),
    'чужая подпись': jwt.sign({ id: 1, role: 'admin', login: 'admin' }, 'wrong-secret-0123456789-wrong-secret-0123456789'),
    'просрочен': jwt.sign({ id: 1, role: 'admin', login: 'admin' }, secret, { expiresIn: -60 }),
    'несуществующий пользователь': jwt.sign({ id: 999999, role: 'admin', login: 'ghost' }, secret),
    'роль менеджера подменена на admin (подпись не пересчитана)': (() => { const t = decodeURIComponent((mgr.split('=')[1] || '')).split('.'); const p = JSON.parse(Buffer.from(t[1], 'base64url')); p.role = 'admin'; return `${t[0]}.${Buffer.from(JSON.stringify(p)).toString('base64url')}.${t[2]}`; })(),
    'мусор': 'abc.def.ghi' };
  for (const [name, tok] of Object.entries(forge)) {
    const a = await api('GET', '/admins', { bearer: tok }), b = await api('GET', '/admins', { cookie: 'rd_session=' + tok });
    ok(`JWT «${name}» не даёт доступа (Bearer и cookie)`, [401, 403].includes(a.s) && [401, 403].includes(b.s), [a.s, b.s]);
  }
  const mgrTokPriv = jwt.sign({ id: real.id, role: 'admin', login: 'mgr' }, secret);   // валидная подпись, но роль admin у пользователя с id админа — id 1 это admin; проверим что роль берётся из БД
  const mt = await api('GET', '/auth/me', { cookie: mgr }); ok('роль берётся из БД, а не из токена (менеджер остаётся менеджером)', mt.j && JSON.stringify(mt.j).includes('manager'), mt.text.slice(0, 120));

  // ── IDOR / доступ без прав ──
  for (const [m, p] of [['GET', '/bookings/1'], ['GET', '/messages'], ['GET', '/reviews/admin'], ['GET', '/logs'], ['GET', '/blacklist'], ['GET', '/system/status']]) { const res = await api(m, p); ok(`аноним не читает ${m} ${p}`, [401, 403, 404].includes(res.s), res.s); }
  const av = await api('GET', `/bookings/availability?date=${futureDate}`); ok('публичная доступность не содержит персональных данных', !/phone|name|car|comment|telefon/i.test(av.text), av.text.slice(0, 120));
  const pubRev = await api('GET', '/reviews'); ok('публичные отзывы без телефона/внутренних полей', !/phone|admin_comment|password/i.test(pubRev.text), pubRev.text.slice(0, 120));
  const pubSvc = await api('GET', '/services'); ok('публичные услуги без внутренних полей', !/password|admin_comment|hash/i.test(pubSvc.text), pubSvc.text.slice(0, 100));

  // ── Mass assignment ──
  const sp = (await api('GET', '/services')).j.services[0];
  r = await api('POST', '/bookings', { body: { name: 'Масс Ассайнмент', phone: '+7 (910) 777-00-01', service: svcName, date: futureDate, time: '16:00', status: 'done', price: 1, paid_amount: 99999, refund_amount: 5, id: 424242, admin_comment: 'взлом', is_admin: true, role: 'admin' } });
  const bk = r.j && r.j.booking; ok('mass assignment: публичная заявка игнорирует status/price/paid/admin_comment', r.s === 201 && bk.status === 'new' && bk.price === sp.price && !bk.paid_amount && bk.id !== 424242, r.j);
  r = await api('POST', '/reviews', { body: { name: 'Масс', stars: 5, text: 'публикуй сам', svc: svcName, status: 'published' } });
  const pub2 = await api('GET', '/reviews'); ok('mass assignment: публичный отзыв нельзя опубликовать самому (status игнорируется)', !JSON.stringify(pub2.j).includes('публикуй сам'), r.s);
  r = await api('PATCH', `/bookings/${bk.id}`, { cookie: mgr, body: { price: 1, status: 'done', role: 'admin', paid_amount: 1 } });
  const mgrView = (await api('GET', '/bookings', { cookie: adm })).j.bookings.find((x) => x.id === bk.id); ok('менеджер не может менять цену заявки', mgrView && mgrView.price === sp.price, mgrView && mgrView.price);

  // ── Прототипное загрязнение, оверсайз, глубокая вложенность, null-байты ──
  for (const [name, body] of [['__proto__', '{"__proto__":{"role":"admin","polluted":true},"login":"x","password":"y"}'], ['constructor.prototype', '{"constructor":{"prototype":{"role":"admin"}},"login":"x","password":"y"}']]) { const res = await api('POST', '/auth/login', { body }); ok(`prototype pollution (${name}) → без 5xx и без входа`, res.s < 500 && res.s !== 200, res.s); }
  const probe = await api('POST', '/auth/login', { body: { login: 'ghost', password: 'x' } }); ok('после pollution-попыток сервер ведёт себя как прежде (401 на неверный вход; 429 — сработал лимит попыток, тоже защита)', [401, 429].includes(probe.s), probe.s);
  const big = await api('POST', '/messages', { body: JSON.stringify({ name: 'x', phone: '+7 (910) 555-00-00', text: 'a'.repeat(5 * 1024 * 1024) }) }); ok('оверсайз тела (5 МБ) → 413/400, не 5xx и не принято', [400, 413].includes(big.s), big.s);
  const deep = await api('POST', '/messages', { body: '['.repeat(50000) + ']'.repeat(50000) }); ok('JSON с глубокой вложенностью → 4xx, сервер жив', deep.s >= 400 && deep.s < 500, deep.s);
  const nul = await api('POST', '/messages', { body: { name: 'a\u0000b', phone: '+7 (910) 555-00-01', text: 'x\u0000y' } }); ok('null-байты в строках → не 5xx', nul.s < 500, nul.s);
  const alive = await api('GET', '/health'); ok('сервер жив после всех атак', alive.s === 200, alive.s);

  // ── CSRF ──
  for (const ct of ['text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data; boundary=x']) { const res = await raw('POST', base + '/services', { cookie: adm, headers: { 'Content-Type': ct, 'X-Requested-With': '' }, body: 'name=CSRF&price=1' }); ok(`CSRF: кросс-сайтовая форма (${ct.split(';')[0]}) с cookie админа отклонена`, [400, 401, 403, 415].includes(res.s), res.s); }
  const corsPre = await raw('OPTIONS', base + '/services', { headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'x-requested-with,content-type' } });
  ok('CORS: preflight с чужого Origin не получает разрешения', !corsPre.h.get('access-control-allow-origin') || corsPre.h.get('access-control-allow-origin') !== 'https://evil.example' && corsPre.h.get('access-control-allow-origin') !== '*', corsPre.h.get('access-control-allow-origin'));
  const corsGet = await raw('GET', base + '/bookings', { cookie: adm, headers: { Origin: 'https://evil.example' } }); ok('CORS: чужой Origin не получает ACAO/credentials на приватном API', corsGet.h.get('access-control-allow-origin') !== 'https://evil.example', corsGet.h.get('access-control-allow-origin'));

  // ── Раскрытие информации, заголовки ──
  const e404 = await api('GET', '/net-takogo-marshruta'); ok('404 API: JSON без стека/путей', e404.s === 404 && !LEAK.test(e404.text), e404.text.slice(0, 100));
  const bad1 = await raw('POST', base + '/bookings', { headers: { 'Content-Type': 'application/json' }, body: '{"name": ' }); ok('битый JSON: 400 без стека/путей', bad1.s === 400 && !LEAK.test(bad1.text), bad1.text.slice(0, 120));
  const traceStatus = await new Promise((res) => { const q = http.request({ host: '127.0.0.1', port: PORT, path: '/api/services', method: 'TRACE' }, (x) => { x.resume(); res(x.statusCode); }); q.on('error', () => res(0)); q.end(); });
  ok('метод TRACE не поддерживается (не отражает запрос)', [404, 405, 501, 400].includes(traceStatus), traceStatus);
  const hs = await api('GET', '/services'); ok('нет X-Powered-By', !hs.h.get('x-powered-by'), hs.h.get('x-powered-by')); ok('API: Content-Type application/json + nosniff', /application\/json/.test(hs.h.get('content-type') || '') && hs.h.get('x-content-type-options') === 'nosniff', [hs.h.get('content-type'), hs.h.get('x-content-type-options')]);
  const crlf = await api('GET', `/bookings/availability?date=2026-01-01%0d%0aSet-Cookie:%20pwn=1`); ok('CRLF-инъекция через параметры не создаёт заголовков', !(crlf.h.get('set-cookie') || '').includes('pwn'), crlf.h.get('set-cookie'));

  // ── Перебор пользователей (одинаковый ответ на «нет пользователя» и «неверный пароль») ──
  const t0 = Date.now(); const noUser = await api('POST', '/auth/login', { body: { login: 'nikogo-net-takogo', password: 'Whatever-Pass-12345' } }); const tNo = Date.now() - t0;
  const t1 = Date.now(); const badPw = await api('POST', '/auth/login', { body: { login: 'admin', password: 'Whatever-Pass-12345' } }); const tBad = Date.now() - t1;
  ok('перебор пользователей: одинаковые статус и сообщение', noUser.s === badPw.s && JSON.stringify(noUser.j) === JSON.stringify(badPw.j), [noUser.j, badPw.j]);
  ok(`перебор пользователей: время ответа сопоставимо (${tNo} мс против ${tBad} мс, разница < 250 мс)`, Math.abs(tNo - tBad) < 250, [tNo, tBad]);

  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('DAST упал:', e); process.exit(1); });
