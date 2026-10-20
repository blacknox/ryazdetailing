// e2e/a11y.js — axe-core (WCAG 2.1 A/AA) по всем публичным страницам и разделам админки, desktop + mobile.
// Требует: npm i -D axe-core. Запуск: E2E_SPEC=a11y.js npm run e2e
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const BASE = process.env.BASE_URL;
const axeSrc = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const PUBLIC = fs.readdirSync(path.join(__dirname, '..')).filter((f) => f.endsWith('.html') && !['admin.html', 'service-page.html'].includes(f));
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
let total = 0;

async function scan(page, label) {
  await page.evaluate(axeSrc);
  const r = await page.evaluate((tags) => axe.run(document, { runOnly: { type: 'tag', values: tags } }), TAGS);
  const v = r.violations;
  total += v.length;
  console.log((v.length ? 'FAIL ' : 'PASS ') + label + (v.length ? `  (${v.length})` : ''));
  for (const x of v) console.log(`       [${x.impact}] ${x.id}: ${x.help} — ${x.nodes.length} шт.  напр.: ${x.nodes[0].target.join(' ')} | ${(x.nodes[0].failureSummary || '').split('\n')[1] || ''}`.slice(0, 330));
}

(async () => {
  const browser = await chromium.launch();
  for (const [name, vp] of [['desktop', { width: 1366, height: 800 }], ['mobile', { width: 375, height: 740 }]]) {
    const ctx = await browser.newContext({ viewport: vp }); const page = await ctx.newPage();
    for (const f of PUBLIC) { await page.goto(`${BASE}/${f}`); await page.waitForLoadState('networkidle'); await page.waitForTimeout(400); await scan(page, `${name}: ${f}`); }
    await ctx.close();
  }
  // Админка
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 800 } }); const page = await ctx.newPage();
  await page.goto(BASE + '/admin.html'); await scan(page, 'admin: экран входа');
  await page.fill('#li', 'admin'); await page.fill('#lp', process.env.ADMIN_PASSWORD); await page.click('.lbtn');
  await page.waitForSelector('.sbnav', { state: 'visible' }); await page.waitForTimeout(600);
  for (const id of ['dashboard', 'bookings', 'schedule', 'messages', 'reviews', 'blacklist', 'services', 'works', 'finance', 'admins', 'settings', 'logs']) {
    await page.evaluate((x) => window.go(x, document.querySelector(`[data-click*='"${x}"']`)), id); await page.waitForTimeout(400);
    await scan(page, 'admin: ' + id);
  }
  await browser.close();
  console.log(`\nнарушений axe: ${total}`); process.exit(total ? 1 : 0);
})();
