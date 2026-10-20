// Структура заголовков: уровень не должен перескакивать больше чем на 1 вниз (WCAG 1.3.1 / Lighthouse heading-order).
// Учитывается aria-level, если он задан.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
for (const f of fs.readdirSync(root).filter((x) => x.endsWith('.html') && x !== 'admin.html')) {
  test(`заголовки без пропуска уровней: ${f}`, () => {
    const html = fs.readFileSync(path.join(root, f), 'utf8');
    let prev = 0; const bad = [];
    for (const m of html.matchAll(/<h([1-6])((?:\s[^>]*)?)>([\s\S]*?)<\/h\1>/g)) {
      const al = m[2].match(/aria-level="(\d)"/); const lvl = al ? +al[1] : +m[1];
      if (prev && lvl > prev + 1) bad.push(`h${lvl} «${m[3].replace(/<[^>]+>/g, '').trim().slice(0, 30)}» после h${prev}`);
      prev = lvl;
    }
    assert.deepStrictEqual(bad, []);
  });
}
