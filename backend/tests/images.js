// tests/images.js — оптимизация загружаемых фото (WebP, размер, EXIF) и защита от «плохих» файлов.
// Запуск — как tests/integration.js: на чистой временной копии, сервер на PORT, затем из той же папки `node tests/images.js`.
const base = `http://127.0.0.1:${process.env.PORT || 3999}/api`;
const fs = require('fs'), path = require('path');
const sharp = require('sharp');
let pass = 0, fail = 0;
const ok = (n, c, x) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : '  -> ' + JSON.stringify(x))); };
async function call(m, p, b, cookie) {
  const r = await fetch(base + p, { method: m, headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'rd-admin', ...(cookie ? { Cookie: cookie } : {}) }, body: b ? JSON.stringify(b) : undefined });
  let j = null; try { j = await r.json(); } catch {}
  return { s: r.status, j, h: r.headers };
}
const uri = (mime, buf) => `data:${mime};base64,${buf.toString('base64')}`;
const disk = (p) => path.join(process.env.BACKEND_DIR || process.cwd(), p);
(async () => {
  let r = await call('POST', '/auth/login', { login: 'admin', password: 'Rz!Tester-Alpha-2026' });
  const ck = r.h.getSetCookie().map((x) => x.split(';')[0]).join('; ');

  // «Фото с телефона»: 3000×2000, шум (плохо жмётся), EXIF с координатами и поворотом
  const raw = Buffer.alloc(3000 * 2000 * 3); for (let i = 0; i < raw.length; i++) raw[i] = (i * 31 + (i >> 7)) & 255;
  const jpg = await sharp(raw, { raw: { width: 3000, height: 2000, channels: 3 } })
    .withExif({ IFD0: { Copyright: 'secret-owner' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '54/1 37/1 0/1', GPSLongitudeRef: 'E', GPSLongitude: '39/1 44/1 0/1' } })
    .jpeg({ quality: 60 }).toBuffer();
  ok('тестовое фото содержит EXIF и меньше 2 МБ', (await sharp(jpg).metadata()).exif && jpg.length < 2 * 1024 * 1024, jpg.length);

  r = await call('POST', '/services', { name: 'Фото-тест', price: 500, photo: uri('image/jpeg', jpg) }, ck);
  const photo = r.j && r.j.service && r.j.service.photo;
  ok('услуга: фото сохранено как .webp', r.s === 201 && /\.webp$/.test(photo), r);
  const saved = fs.readFileSync(disk(photo));
  const meta = await sharp(saved).metadata();
  ok('формат webp', meta.format === 'webp', meta.format);
  ok('длинная сторона ≤ 1600 px', Math.max(meta.width, meta.height) <= 1600, [meta.width, meta.height]);
  ok('пропорции сохранены (3:2)', Math.abs(meta.width / meta.height - 1.5) < 0.01, [meta.width, meta.height]);
  ok('EXIF/GPS стёрты', !meta.exif && !saved.includes(Buffer.from('secret-owner')), meta.exif && meta.exif.length);
  ok('файл легче оригинала', saved.length < jpg.length, [saved.length, jpg.length]);

  // Плохие файлы
  const fakePng = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.from('это не картинка, просто мусор после сигнатуры')]);
  r = await call('POST', '/services', { name: 'Плохой', price: 1, photo: uri('image/png', fakePng) }, ck);
  ok('png-сигнатура + мусор → 400', r.s === 400, r);
  const bomb = await sharp({ create: { width: 8000, height: 8000, channels: 3, background: '#fff' } }).png({ compressionLevel: 9 }).toBuffer();
  ok('«бомба» 64 Мп весит < 2 МБ (тест корректен)', bomb.length < 2 * 1024 * 1024, bomb.length);
  r = await call('POST', '/services', { name: 'Бомба', price: 1, photo: uri('image/png', bomb) }, ck);
  ok('64-мегапиксельная «бомба» отклонена', r.s === 400, r);
  r = await call('POST', '/services', { name: 'Svg', price: 1, photo: uri('image/svg+xml', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')) }, ck);
  ok('SVG не принимается', r.s === 400, r);
  ok('отклонённые не оставили файлов', fs.readdirSync(disk('uploads/services')).length === 1, fs.readdirSync(disk('uploads/services')));

  // Замена фото удаляет старый файл
  const png = await sharp({ create: { width: 400, height: 300, channels: 4, background: { r: 10, g: 120, b: 200, alpha: 0.5 } } }).png().toBuffer();
  const list = (await call('GET', '/services')).j.services; const svc = list.find((s) => s.name === 'Фото-тест');
  r = await call('PATCH', '/services/' + svc.id, { photo: uri('image/png', png) }, ck);
  ok('замена: новый .webp, старый файл удалён', r.s === 200 && r.j.service.photo !== photo && !fs.existsSync(disk(photo)) && fs.existsSync(disk(r.j.service.photo)), r);
  const alpha = await sharp(fs.readFileSync(disk(r.j.service.photo))).metadata();
  ok('прозрачность PNG сохранилась', alpha.hasAlpha === true, alpha);

  // Публичный отзыв с фото
  const small = await sharp({ create: { width: 800, height: 600, channels: 3, background: '#336699' } }).jpeg().toBuffer();
  r = await call('POST', '/reviews', { name: 'Иван П', text: 'Отличная мойка', stars: 5, photos: [uri('image/jpeg', small), uri('image/png', fakePng)] });
  ok('отзыв принят, битое фото отброшено', r.s >= 200 && r.s < 300, r);
  const rv = (await call('GET', '/reviews/admin', null, ck)).j;
  const mine = rv && (rv.reviews || []).find((x) => x.name === 'Иван П');
  ok('фото отзыва — .webp', mine && mine.photos && mine.photos.length === 1 && /\.webp$/.test(mine.photos[0]), mine);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
