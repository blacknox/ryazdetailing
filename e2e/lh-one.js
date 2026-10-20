// e2e/lh-one.js — один Lighthouse-замер с разбором узких мест:  LH_PAGE=/service-wash.html LH_FORM=mobile E2E_SPEC=lh-one.js npm run e2e
const chromeLauncher = require('chrome-launcher');
(async () => {
  const { default: lighthouse } = await import('lighthouse');
  const chrome = await chromeLauncher.launch({ chromePath: process.env.CHROME_PATH, chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu'] });
  const pg = process.env.LH_PAGE || '/index.html', form = process.env.LH_FORM || 'mobile';
  let r; for (let i = 0; i < 4 && !r; i++) { try { r = (await lighthouse(process.env.BASE_URL + pg, { port: chrome.port, output: 'json', logLevel: 'error', onlyCategories: ['performance', 'best-practices'] }, form === 'desktop' ? { extends: 'lighthouse:default', settings: { formFactor: 'desktop', screenEmulation: { mobile: false, width: 1350, height: 940, deviceScaleFactor: 1, disabled: false }, throttling: { rttMs: 40, throughputKbps: 10240, cpuSlowdownMultiplier: 1 } } } : undefined)).lhr; if (r.runtimeError) r = null; } catch { r = null; } }
  if (!r) { console.log('не удалось измерить'); await chrome.kill(); return; }
  const a = r.audits; console.log(`${form} ${pg}: perf ${Math.round(r.categories.performance.score * 100)} | LCP ${a['largest-contentful-paint'].displayValue} | TBT ${a['total-blocking-time'].displayValue} | FCP ${a['first-contentful-paint'].displayValue} | SI ${a['speed-index'].displayValue}`);
  const lcp = a['largest-contentful-paint-element']; if (lcp && lcp.details && lcp.details.items[0]) console.log('LCP-элемент:', JSON.stringify(lcp.details.items[0].items ? lcp.details.items[0].items[0].node.snippet : lcp.details.items[0]).slice(0, 160));
  const bt = a['bootup-time']; if (bt && bt.details) console.log('Время по скриптам:\n' + bt.details.items.slice(0, 6).map((i) => `   ${String(Math.round(i.total)).padStart(5)} мс (скрипт ${Math.round(i.scripting)}, разбор ${Math.round(i.scriptParseCompile)})  ${i.url.replace(process.env.BASE_URL, '')}`).join('\n'));
  const lt = a['long-tasks']; if (lt && lt.details) console.log('Длинные задачи:\n' + lt.details.items.slice(0, 6).map((i) => `   ${Math.round(i.duration)} мс  ${String(i.url).replace(process.env.BASE_URL, '')}`).join('\n'));
  const rb = a['render-blocking-insight']; if (rb && rb.details && rb.details.items) console.log('Блокируют отрисовку:', rb.details.items.map((i) => i.url.replace(process.env.BASE_URL, '') + ' ' + Math.round(i.wastedMs || 0) + 'мс').join(', '));
  for (const id of Object.keys(a).filter((k) => /insight$/.test(k))) { const x = a[id]; if (x.score !== null && x.score < 1 && x.scoreDisplayMode !== 'notApplicable') console.log(`insight ${id} (${x.score}): ${x.displayValue || ''} ${x.details && x.details.items ? JSON.stringify(x.details.items).slice(0, 380) : JSON.stringify(x.details || {}).slice(0, 380)}`); }
  const bd = a['lcp-breakdown-insight']; if (bd && bd.details) console.log('LCP breakdown:', JSON.stringify(bd.details).slice(0, 700));
  const ec = a['errors-in-console']; if (ec && ec.score !== null && ec.score < 1) console.log('errors-in-console:', JSON.stringify(ec.details && ec.details.items).slice(0, 500));
  const nt = a['network-dependency-tree-insight']; if (nt && nt.details) { const out = []; const walk = (n, d) => { for (const k of Object.keys(n || {})) { const c = n[k]; out.push('  '.repeat(d) + (c.url || '').replace(process.env.BASE_URL, '') + ' ' + Math.round(c.navStartToEndTime || 0) + 'мс ' + Math.round((c.transferSize || 0) / 1024) + 'КБ'); walk(c.children, d + 1); } }; for (const it of nt.details.items || []) if (it.value && it.value.chains) walk(it.value.chains, 0); console.log('Цепочка загрузки:\n' + out.slice(0, 18).join('\n')); }
  await chrome.kill();
})();
