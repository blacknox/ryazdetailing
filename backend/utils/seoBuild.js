// utils/seoBuild.js — генерация индексируемых страниц /services/<slug>/ для услуг,
// добавленных через админку (у базовых услуг уже есть свои service-*.html), а также
// sitemap.xml и robots.txt.
//
// Почему статичные файлы, а не service-page.html?id=…: поисковик получает готовый HTML
// с уникальными title/description/canonical и JSON-LD без выполнения скриптов
// (политика CSP на сайте запрещает inline-JS, а страница с ?id= — дубль одной и той же).
//
// Работает, когда задана переменная SITE_DIR (папка со статикой сайта, там же лежит index.html).
// Без неё — ничего не делает (например, если сайт раздаётся отдельным хостингом).
const fs = require('fs');
const path = require('path');
const db = require('../db');

const SITE_URL = () => String(process.env.SITE_URL || 'https://ryazdetailing.ru').replace(/\/+$/, '');

function siteDir() {
  const d = process.env.SITE_DIR;
  return d && fs.existsSync(path.join(d, 'index.html')) ? path.resolve(d) : null;
}

const esc = (v) =>
  String(v === null || v === undefined ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// JSON внутри <script type="application/ld+json">: «<» экранируем, чтобы не закрыть тег.
const ld = (obj) => JSON.stringify(obj, null, 2).replace(/</g, '\\u003c');

function truncate(text, max) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  return t.length <= max ? t : t.slice(0, max - 1).replace(/\s+\S*$/, '') + '…';
}

// Названия услуг, у которых уже есть собственная статичная страница service-*.html.
function staticServiceNames(dir) {
  const names = new Set();
  for (const f of fs.readdirSync(dir)) {
    if (!/^service-.+\.html$/.test(f) || f === 'service-page.html') continue;
    const html = fs.readFileSync(path.join(dir, f), 'utf8');
    // Явная привязка статической страницы к услуге из базы: <meta name="rd-service" content="Название">.
    // Нужна, когда название в базе отличается от JSON-LD страницы, иначе появится дубль /services/<slug>/.
    for (const m of html.matchAll(/<meta\s+name="rd-service"\s+content="([^"]+)"/g)) names.add(m[1].trim());
    for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
      try {
        const j = JSON.parse(m[1]);
        if (j && j['@type'] === 'Service' && j.name) names.add(String(j.name).trim());
      } catch { /* битый JSON-LD не должен ронять сборку */ }
    }
  }
  return names;
}

// Шапка и подвал берём из живой страницы сайта — меню не расходится с остальными страницами.
function sharedChrome(dir) {
  const src = path.join(dir, 'service-wash.html');
  if (!fs.existsSync(src)) throw new Error('Не найден service-wash.html — не из чего взять шапку/подвал');
  const html = fs.readFileSync(src, 'utf8');
  const header = html.match(/<header class="site-header">[\s\S]*?<\/header>/);
  const footer = html.match(/<footer class="site-footer">[\s\S]*?<\/footer>/);
  if (!header || !footer) throw new Error('В service-wash.html нет header.site-header / footer.site-footer');
  // Страница лежит на /services/<slug>/, поэтому относительные ссылки делаем от корня.
  const abs = (s) => s.replace(/(href|src)="(?!https?:|\/|#|tel:|mailto:|data:|javascript:)([^"]*)"/g, '$1="/$2"');
  return { header: abs(header[0]), footer: abs(footer[0]) };
}

function renderServicePage(svc, chrome) {
  const base = SITE_URL();
  const url = `${base}/services/${svc.slug}/`;
  const title = `${svc.name} в Рязани — РязДетейлинг`;
  const description = truncate(svc.desc || svc.full_desc || `${svc.name} в Рязани: профессиональный детейлинг, запись онлайн.`, 160);
  const price = Number(svc.price) || 0;
  const disc = Number(svc.discount) || 0;
  const finalPrice = disc > 0 ? Math.round(price * (1 - disc / 100)) : price;
  const photo = svc.photo && /^\/?uploads\//.test(svc.photo) ? `${base}/${svc.photo.replace(/^\//, '')}` : `${base}/assets/og-cover.jpg`;
  const bookHref = `/booking.html?service=${encodeURIComponent(svc.name)}`;
  const priceText = `от ${finalPrice.toLocaleString('ru-RU')} ₽`;

  const serviceLd = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: svc.name,
    description,
    url,
    image: photo,
    areaServed: { '@type': 'City', name: 'Рязань' },
    provider: { '@type': 'AutomotiveBusiness', name: 'РязДетейлинг', url: `${base}/` },
    offers: { '@type': 'Offer', price: String(finalPrice), priceCurrency: 'RUB', availability: 'https://schema.org/InStock', url },
  };
  const crumbsLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Главная', item: `${base}/` },
      { '@type': 'ListItem', position: 2, name: 'Услуги', item: `${base}/services.html` },
      { '@type': 'ListItem', position: 3, name: svc.name, item: url },
    ],
  };

  const paragraphs = String(svc.full_desc || '')
    .split(/\n{1,}/).map((p) => p.trim()).filter(Boolean)
    .map((p) => `<p style="line-height:1.7;color:var(--muted)">${esc(p)}</p>`).join('\n        ');
  const photoHtml = svc.photo && /^\/?uploads\//.test(svc.photo)
    ? `<img src="/${esc(svc.photo.replace(/^\//, ''))}" alt="${esc(svc.name)}" loading="lazy" decoding="async" style="max-width:100%;border-radius:12px;margin:0 0 20px">`
    : '';
  const descSection = paragraphs || photoHtml
    ? `    <section class="sp-what">
      <h2>Об услуге</h2>
      <div class="sp-what-line"></div>
        ${photoHtml}
        ${paragraphs}
    </section>\n`
    : '';

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <link rel="icon" href="/favicon.ico" sizes="32x32">
  <link rel="icon" type="image/png" sizes="192x192" href="/assets/favicon-192.png">
  <link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}" />
  <script type="application/ld+json">
${ld(serviceLd)}
  </script>
  <script type="application/ld+json">
${ld(crumbsLd)}
  </script>
  <link rel="stylesheet" href="/style.css">
  <link rel="stylesheet" href="/css/service.css">
  <link rel="canonical" href="${esc(url)}" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(description)}" />
  <meta property="og:url" content="${esc(url)}" />
  <meta property="og:image" content="${esc(photo)}" />
  <meta property="og:site_name" content="РязДетейлинг" />
  <meta property="og:locale" content="ru_RU" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${esc(title)}" />
  <meta name="twitter:description" content="${esc(description)}" />
  <meta name="twitter:image" content="${esc(photo)}" />
</head>
<body>
  ${chrome.header}
  <main>
    <section class="sp-hero">
      <div class="sp-hero-text">
        <p class="sp-breadcrumb"><a href="/index.html" style="color:var(--muted);text-decoration:none;">Главная</a> / <a href="/services.html" style="color:var(--muted);text-decoration:none;">Услуги</a> / <span>${esc(svc.name)}</span></p>
        <h1>${esc(svc.name)}</h1>
        <div class="gold-line"></div>
        <p>${esc(svc.desc || '')}</p>
      </div>
    </section>

    <div class="sp-price-band">
      <div>
        <div class="sp-price-label">Стоимость услуги</div>
        <div class="sp-price-val">${esc(priceText)}</div>
      </div>
      <div class="sp-price-meta">
        <strong>Продолжительность:</strong> ${esc(svc.dur || 'уточняйте при записи')}
      </div>
      <a class="sp-book-btn" href="${esc(bookHref)}">Записаться</a>
    </div>

${descSection}  </main>
  ${chrome.footer}
  <script src="/script.js"></script>
</body>
</html>
`;
}

function writeAtomic(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, file);
}

function buildSitemap(dir, generated) {
  const base = SITE_URL();
  const file = path.join(dir, 'sitemap.xml');
  let blocks = [];
  if (fs.existsSync(file)) {
    blocks = (fs.readFileSync(file, 'utf8').match(/<url>[\s\S]*?<\/url>/g) || [])
      .filter((b) => !/<loc>[^<]*\/services\//.test(b)); // прежние сгенерированные адреса пересоздаём
  }
  const today = new Date().toISOString().slice(0, 10);
  for (const svc of generated) {
    blocks.push(`<url>\n    <loc>${esc(`${base}/services/${svc.slug}/`)}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.7</priority>\n  </url>`);
  }
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  ${blocks.join('\n  ')}\n</urlset>\n`;
  writeAtomic(file, xml);
}

function buildRobots(dir) {
  const txt = `User-agent: *
Allow: /
Disallow: /admin.html
Disallow: /admin-app/
Disallow: /api/
Disallow: /service-page.html

Sitemap: ${SITE_URL()}/sitemap.xml
`;
  const file = path.join(dir, 'robots.txt');
  if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== txt) writeAtomic(file, txt);
}

/**
 * Пересобирает /services/<slug>/index.html, sitemap.xml и robots.txt.
 * @returns {{generated: string[], removed: string[]}|null} null — SITE_DIR не задан
 */
function buildSeo() {
  const dir = siteDir();
  if (!dir) return null;
  const chrome = sharedChrome(dir);
  const hasStatic = staticServiceNames(dir);
  const rows = db.prepare('SELECT * FROM services WHERE active = 1 AND slug IS NOT NULL ORDER BY id').all()
    .filter((s) => !hasStatic.has(String(s.name).trim()));

  const outRoot = path.join(dir, 'services');
  const manifestFile = path.join(outRoot, '.generated.json');
  let previous = [];
  try { previous = JSON.parse(fs.readFileSync(manifestFile, 'utf8')); } catch { /* первого запуска ещё не было */ }

  for (const svc of rows) writeAtomic(path.join(outRoot, svc.slug, 'index.html'), renderServicePage(svc, chrome));

  // Удаляем только то, что создали сами (по манифесту): чужие файлы в services/ не трогаем.
  const keep = new Set(rows.map((r) => r.slug));
  const removed = [];
  for (const slug of previous) {
    if (keep.has(slug) || !/^[a-z0-9-]+$/.test(slug)) continue;
    fs.rmSync(path.join(outRoot, slug), { recursive: true, force: true });
    removed.push(slug);
  }
  writeAtomic(manifestFile, JSON.stringify([...keep]));

  buildSitemap(dir, rows);
  buildRobots(dir);
  return { generated: [...keep], removed };
}

let timer = null;
// Вызывается после изменения услуг: несколько правок подряд сольются в одну сборку.
function scheduleSeoBuild() {
  if (!siteDir()) return;
  clearTimeout(timer);
  timer = setTimeout(() => {
    try {
      const r = buildSeo();
      if (r) console.log(`[seo] страницы услуг: ${r.generated.length}, удалено: ${r.removed.length}`);
    } catch (err) {
      console.error('[seo] Не удалось пересобрать страницы услуг:', err.message);
    }
  }, 2000);
  if (timer.unref) timer.unref();
}

// Адрес готовой SEO-страницы услуги (если она реально сгенерирована), иначе null.
function generatedPageUrl(slug) {
  const dir = siteDir();
  if (!dir || !slug || !/^[a-z0-9-]+$/.test(slug)) return null;
  return fs.existsSync(path.join(dir, 'services', slug, 'index.html')) ? `/services/${slug}/` : null;
}

module.exports = { staticServiceNames, buildSeo, scheduleSeoBuild, renderServicePage, generatedPageUrl };
