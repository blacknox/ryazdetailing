// Статическая страница услуги не должна дублироваться динамической /services/<slug>/.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
process.env.JWT_SECRET = 'x'.repeat(40);
const { staticServiceNames } = require('../../utils/seoBuild');

function siteWith(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seo-unit-'));
  for (const [n, c] of Object.entries(files)) fs.writeFileSync(path.join(dir, n), c);
  return dir;
}
const ld = (name) => `<script type="application/ld+json">{"@type":"Service","name":"${name}"}</script>`;

test('имя услуги берётся из JSON-LD статической страницы', () => {
  const d = siteWith({ 'service-a.html': ld('Мойка') });
  assert.deepStrictEqual([...staticServiceNames(d)], ['Мойка']);
});
test('rd-service связывает страницу с услугой, чьё имя в базе отличается', () => {
  const d = siteWith({ 'service-ppf.html': '<meta name="rd-service" content="Оклейка PPF">' + ld('Оклеивание защитной плёнкой (PPF)') });
  const n = staticServiceNames(d);
  assert.ok(n.has('Оклейка PPF') && n.has('Оклеивание защитной плёнкой (PPF)'));
});
test('service-page.html и не-service файлы игнорируются, битый JSON-LD не роняет сборку', () => {
  const d = siteWith({ 'service-page.html': ld('Шаблон'), 'about.html': ld('О нас'), 'service-b.html': '<script type="application/ld+json">{bad</script>' });
  assert.deepStrictEqual([...staticServiceNames(d)], []);
});
