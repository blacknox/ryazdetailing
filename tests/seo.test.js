// SEO-регрессия: метаданные, canonical, sitemap, robots, JSON-LD.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const ORIGIN = 'https://ryazdetailing.ru';
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const pages = fs.readdirSync(root).filter((f) => f.endsWith('.html'));
const isNoindex = (h) => /<meta name="robots" content="[^"]*noindex/i.test(h);
const publicPages = pages.filter((f) => !isNoindex(read(f)));

test('служебные страницы закрыты noindex (admin.html, service-page.html)', () => {
  for (const f of ['admin.html', 'service-page.html']) assert.ok(isNoindex(read(f)), f);
});

test('у каждой публичной страницы есть title, description, canonical, og:title/description/image', () => {
  for (const f of publicPages) {
    const h = read(f);
    assert.ok(/<title>[^<]{10,}<\/title>/.test(h), f + ': title');
    assert.ok(/<meta name="description" content="[^"]{50,}"/.test(h), f + ': description');
    assert.ok(/<link rel="canonical" href="https:\/\/ryazdetailing\.ru\/[^"]*"/.test(h), f + ': canonical');
    for (const og of ['og:title', 'og:description', 'og:image']) assert.ok(h.includes(`property="${og}"`), `${f}: ${og}`);
  }
});

test('title и description уникальны, не слишком длинные', () => {
  const t = new Map(), d = new Map();
  for (const f of publicPages) {
    const h = read(f);
    const title = h.match(/<title>(.*?)<\/title>/s)[1].trim(), desc = h.match(/<meta name="description" content="(.*?)"/)[1];
    assert.ok(title.length <= 65, `${f}: title ${title.length} симв.`); assert.ok(desc.length <= 165, `${f}: description ${desc.length} симв.`);
    assert.ok(!t.has(title), `дубль title: ${f} и ${t.get(title)}`); t.set(title, f);
    assert.ok(!d.has(desc), `дубль description: ${f} и ${d.get(desc)}`); d.set(desc, f);
  }
});

test('canonical указывает на саму страницу', () => {
  for (const f of publicPages) {
    const href = read(f).match(/<link rel="canonical" href="(.*?)"/)[1];
    const expected = f === 'index.html' ? ORIGIN + '/' : `${ORIGIN}/${f}`;
    assert.strictEqual(href, expected, f);
  }
});

test('sitemap: абсолютные https-URL, только существующие индексируемые страницы, у всех есть lastmod', () => {
  const xml = read('sitemap.xml');
  const urls = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);
  assert.ok(urls.length >= publicPages.length - 1);
  for (const u of urls) {
    assert.ok(u.startsWith(ORIGIN + '/'), 'не абсолютный: ' + u);
    const f = u === ORIGIN + '/' ? 'index.html' : u.slice(ORIGIN.length + 1);
    if (f.startsWith('services/')) continue; // динамические страницы создаёт бэкенд
    assert.ok(fs.existsSync(path.join(root, f)), 'в sitemap нет файла: ' + u);
    assert.ok(!isNoindex(read(f)), 'noindex-страница в sitemap: ' + u);
  }
  for (const f of publicPages) assert.ok(urls.includes(f === 'index.html' ? ORIGIN + '/' : `${ORIGIN}/${f}`), f + ' отсутствует в sitemap');
  assert.strictEqual((xml.match(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/g) || []).length, urls.length, 'lastmod у каждой записи');
});

test('robots.txt: публичное открыто, админка/API/служебное закрыто, указан sitemap', () => {
  const r = read('robots.txt');
  assert.ok(/Allow: \//.test(r) && !/^Disallow: \/\s*$/m.test(r), 'сайт целиком закрыт');
  for (const p of ['/admin.html', '/admin-app/', '/api/', '/service-page.html']) assert.ok(r.includes('Disallow: ' + p), p);
  assert.ok(r.includes(`Sitemap: ${ORIGIN}/sitemap.xml`));
});

test('JSON-LD: валидный JSON, нет выдуманных рейтингов и отзывов', () => {
  for (const f of publicPages) {
    for (const m of read(f).matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
      const json = JSON.parse(m[1]); // упадёт при битом JSON
      assert.ok(!/AggregateRating|"Review"|ratingValue/.test(m[1]), f + ': недостоверный рейтинг/отзыв в разметке');
      assert.strictEqual(json['@context'], 'https://schema.org', f);
    }
  }
});

test('страницы услуг с фоном героя заранее загружают его (LCP): preload + fetchpriority=high для мобильной и десктопной ширины', () => {
  for (const f of ['service-wash.html', 'service-engine.html', 'service-headlights.html', 'service-interior.html', 'service-ozone.html', 'service-wheels.html']) {
    const h = read(f);
    const tags = [...h.matchAll(/<link rel="preload" as="image" href="(assets\/[^"]+\.avif)" type="image\/avif" media="\(((?:max|min)-width: \d+px)\)" fetchpriority="high">/g)];
    assert.strictEqual(tags.length, 2, f + ': нужны два preload (мобильный и десктопный)');
    for (const m of tags) assert.ok(fs.existsSync(path.join(root, m[1])), f + ': нет файла ' + m[1]);
    assert.ok(tags.some((m) => m[2] === 'max-width: 700px') && tags.some((m) => m[2] === 'min-width: 701px'), f + ': пороги должны быть 700/701px как в CSS');
  }
});

test('главная: preload героя совпадает с тем, что реально выбирает CSS (AVIF), для мобильной и десктопной ширины', () => {
  const h = read('index.html'), css = read('style.css');
  assert.ok(!/<link rel="preload" as="image" href="[^"]+\.webp"/.test(h), 'preload WebP при том, что CSS берёт AVIF, — браузер скачает оба файла');
  for (const f of ['assets/hero-car.avif', 'assets/hero-car-800w.avif', 'assets/hero-car-800w.webp']) {
    assert.ok(fs.existsSync(path.join(root, f)), 'нет файла ' + f);
    assert.ok(h.includes(f) || css.includes(f), f + ' нигде не используется');
  }
  assert.ok(/media="\(max-width: 700px\)"/.test(h) && /media="\(min-width: 701px\)"/.test(h) && /@media \(max-width: 700px\)[\s\S]*hero-car-800w/.test(css), 'пороги 700/701px должны совпадать в HTML и CSS');
});

test('favicon: на каждой странице объявлен набор иконок, файлы существуют (иначе браузер получает 404 на /favicon.ico)', () => {
  for (const f of pages) {
    const h = read(f);
    for (const frag of ['href="favicon.ico"', 'href="assets/favicon-192.png"', 'href="assets/apple-touch-icon.png"']) assert.ok(h.includes(frag), `${f}: нет ${frag}`);
  }
  for (const f of ['favicon.ico', 'assets/favicon-32.png', 'assets/favicon-192.png', 'assets/apple-touch-icon.png']) assert.ok(fs.existsSync(path.join(root, f)), 'нет файла ' + f);
});

test('все страницы с героем hero-car: парный preload (мобильный/десктопный) и мобильный фон в CSS', () => {
  const css = { 'about.html': 'css/about.css', 'booking.html': 'css/booking.css', 'contacts.html': 'css/contacts.css', 'gallery.html': 'css/gallery.css', 'reviews.html': 'css/reviews.css', 'prices.html': 'style.css', 'services.html': 'style.css', 'privacy.html': 'style.css' };
  for (const [page, file] of Object.entries(css)) {
    const h = read(page);
    assert.ok(h.includes('href="assets/hero-car-800w.avif" type="image/avif" media="(max-width: 700px)"'), page + ': нет мобильного preload');
    assert.ok(h.includes('href="assets/hero-car.avif" type="image/avif" media="(min-width: 701px)"'), page + ': нет десктопного preload');
    assert.ok(/@media \(max-width: 700px\)[\s\S]*hero-car-800w/.test(read(file)), file + ': нет мобильного фона героя');
  }
});

test('фон героя не задаётся инлайн-стилем: он перебивает мобильную версию картинки и тянет полноразмерный файл', () => {
  for (const f of pages) assert.ok(!/style="[^"]*hero-car/.test(read(f)), f + ': инлайн-стиль с hero-car');
});
