// e2e/lighthouse.js — Lighthouse по страницам; на каждую страницу LH_RUNS прогонов (по умолчанию 3), в отчёт идёт МЕДИАНА по Performance
// (один замер ненадёжен: на общем CPU разброс бывает 15–25 баллов). Требует: npm i -D lighthouse chrome-launcher
// Запуск: E2E_SPEC=lighthouse.js npm run e2e   Параметры: LH_PAGES=/index.html,/booking.html  LH_FORMS=mobile  LH_RUNS=3  CHROME_PATH=...
const chromeLauncher = require('chrome-launcher');
const BASE = process.env.BASE_URL;
const PAGES = (process.env.LH_PAGES || '/index.html,/service-wash.html,/booking.html,/contacts.html').split(',');
const RUNS = Math.max(1, Number(process.env.LH_RUNS || 3));
const median = (a) => [...a].sort((x, y) => x.perf - y.perf)[Math.floor(a.length / 2)];
(async () => {
  const { default: lighthouse } = await import('lighthouse');
  const chrome = await chromeLauncher.launch({ chromePath: process.env.CHROME_PATH, chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu'] });
  const all = [];
  for (const form of (process.env.LH_FORMS || 'desktop,mobile').split(',')) {
    for (const pg of PAGES) {
      const flags = { port: chrome.port, output: 'json', logLevel: 'error', onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'] };
      const config = form === 'desktop' ? { extends: 'lighthouse:default', settings: { formFactor: 'desktop', screenEmulation: { mobile: false, width: 1350, height: 940, deviceScaleFactor: 1, disabled: false }, throttling: { rttMs: 40, throughputKbps: 10240, cpuSlowdownMultiplier: 1 } } } : undefined;
      const runs = [];
      for (let k = 0; k < RUNS; k++) {
        let r; for (let t = 0; t < 3 && !r; t++) { try { r = (await lighthouse(BASE + pg, flags, config)).lhr; if (r.runtimeError) r = null; } catch { r = null; } }
        if (!r) continue;
        const c = r.categories, a = r.audits;
        runs.push({ perf: Math.round(c.performance.score * 100), a11y: Math.round(c.accessibility.score * 100), bp: Math.round(c['best-practices'].score * 100), seo: Math.round(c.seo.score * 100), lcp: a['largest-contentful-paint'].displayValue, cls: a['cumulative-layout-shift'].displayValue, tbt: a['total-blocking-time'].displayValue });
      }
      if (!runs.length) { console.log(`${form.padEnd(7)} ${pg.padEnd(20)} НЕ УДАЛОСЬ измерить`); all.push({ form, pg, error: true }); continue; }
      const m = median(runs);
      console.log(`${form.padEnd(7)} ${pg.padEnd(20)} perf ${m.perf} (прогоны: ${runs.map((x) => x.perf).join('/')})  a11y ${m.a11y}  bp ${m.bp}  seo ${m.seo}  | LCP ${m.lcp} CLS ${m.cls} TBT ${m.tbt}`);
      all.push({ form, pg, ...m, runs: runs.map((x) => x.perf) });
    }
  }
  await chrome.kill();
  require('fs').writeFileSync(process.env.LH_OUT || '/tmp/lh.json', JSON.stringify(all, null, 2));
})().catch((e) => { console.error(e); process.exit(1); });
