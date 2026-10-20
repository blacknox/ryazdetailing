// Регрессия: пользовательский текст не должен попадать в innerHTML без экранирования.
// Эвристика: ищем интерполяции ${obj.поле} для текстовых полей, которые вводит посторонний
// человек или администратор (имя, телефон, комментарий, авто, категория и т.д.), вне escapeHtml/esc.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const files = [
  ...fs.readdirSync(path.join(root, 'admin-app')).filter((f) => f.endsWith('.js')).map((f) => path.join('admin-app', f)),
  ...fs.readdirSync(path.join(root, 'js')).filter((f) => f.endsWith('.js')).map((f) => path.join('js', f)),
  'script.js',
];

const TEXT_FIELDS = 'name|cat|time|phone|car|comment|admin_comment|text|desc|description|title|author|svc|service|reply|subject|login|message';
const RISKY = new RegExp('\\$\\{\\s*[A-Za-z_][\\w.]*\\.(?:' + TEXT_FIELDS + ')\\s*\\}', 'g');

test('в шаблонах нет неэкранированных текстовых полей (${x.name} и т.п.)', () => {
  const bad = [];
  for (const rel of files) {
    const src = fs.readFileSync(path.join(root, rel), 'utf8');
    src.split('\n').forEach((line, i) => {
      // toast() экранирует title/body внутри (ui.js), addLog() — пустая функция: оба безопасны.
      if (/\b(toast|addLog)\(/.test(line)) return;
      if (RISKY.test(line)) bad.push(`${rel}:${i + 1}: ${line.trim().slice(0, 120)}`);
      RISKY.lastIndex = 0;
    });
  }
  assert.deepStrictEqual(bad, [], 'Найдены неэкранированные вставки:\n' + bad.join('\n'));
});

test('toast() экранирует title и body внутри себя', () => {
  const src = fs.readFileSync(path.join(root, 'admin-app', 'ui.js'), 'utf8');
  const fn = src.slice(src.indexOf('function toast'), src.indexOf('function toast') + 900);
  assert.ok(/escapeHtml\(title\)/.test(fn) && /escapeHtml\(body\)/.test(fn), 'toast должен экранировать title и body');
});

test('renderWorks экранирует name, cat и time', () => {
  const src = fs.readFileSync(path.join(root, 'admin-app', 'catalog.js'), 'utf8');
  for (const f of ['name', 'cat', 'time']) {
    assert.ok(src.includes(`escapeHtml(w.${f})`), `renderWorks: w.${f} должен быть в escapeHtml()`);
  }
});

test('money.js подключён в admin.html раньше dashboard.js и finance.js', () => {
  const html = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
  const iMoney = html.indexOf('admin-app/money.js');
  assert.ok(iMoney > -1, 'money.js не подключён');
  assert.ok(iMoney < html.indexOf('admin-app/dashboard.js'));
  assert.ok(iMoney < html.indexOf('admin-app/finance.js'));
});
