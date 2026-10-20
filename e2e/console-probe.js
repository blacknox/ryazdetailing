const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  for (const [name, vp] of [['mobile', { width: 412, height: 823 }], ['desktop', { width: 1350, height: 940 }]]) {
    const p = await (await b.newContext({ viewport: vp })).newPage();
    p.on('console', (m) => { if (['error', 'warning'].includes(m.type())) console.log(name, m.type().toUpperCase(), m.text().slice(0, 200), '|', (m.location().url || '').replace(process.env.BASE_URL, '')); });
    p.on('requestfailed', (r) => console.log(name, 'REQUEST FAILED', r.url().replace(process.env.BASE_URL, ''), r.failure() && r.failure().errorText));
    p.on('response', (r) => { if (r.status() >= 400) console.log(name, 'HTTP', r.status(), r.url().replace(process.env.BASE_URL, '')); });
    for (const pg of ['/about.html', '/gallery.html', '/services.html', '/reviews.html']) { await p.goto(process.env.BASE_URL + pg); await p.waitForLoadState('networkidle'); await p.waitForTimeout(800); }
  }
  await b.close(); console.log('готово');
})();
