// Проверки конфигурации при старте: слабые пароли и обязательный SITE_DIR в production.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sc = require('../../utils/startupChecks');

test('шаблонный пароль из .env.example отклоняется', () => {
  assert.ok(sc.weakPasswordReason('замените_на_надёжный_пароль'));
  assert.throws(() => sc.assertStrongPassword('ADMIN_PASSWORD', 'замените_на_надёжный_пароль'), /ADMIN_PASSWORD/);
});

test('короткие и типовые пароли отклоняются', () => {
  for (const p of ['', 'abc', 'Short-1', 'admin123456789', 'Password-2026-x', 'aaaaaaaaaaaaaaaa']) {
    assert.ok(sc.weakPasswordReason(p), `должен отклоняться: ${p}`);
  }
});

test('нормальный пароль проходит', () => {
  assert.strictEqual(sc.weakPasswordReason('Rz!Tester-Alpha-2026'), null);
  assert.doesNotThrow(() => sc.assertStrongPassword('ADMIN_PASSWORD', 'k7#Vq9-lamp-Orbit-52'));
});

test('вне production проверки окружения не мешают', () => {
  assert.deepStrictEqual(sc.productionEnvErrors({ NODE_ENV: 'development' }), []);
  assert.deepStrictEqual(sc.productionEnvErrors({}), []);
});

test('production: SITE_DIR обязателен', () => {
  const e = sc.productionEnvErrors({ NODE_ENV: 'production' });
  assert.ok(e.some((m) => m.includes('SITE_DIR не задан')));
  assert.throws(() => sc.assertProductionEnv({ NODE_ENV: 'production' }), /SITE_DIR/);
});

test('production: SEO_DISABLED=1 сознательно отключает требование', () => {
  assert.deepStrictEqual(sc.productionEnvErrors({ NODE_ENV: 'production', SEO_DISABLED: '1' }), []);
});

test('production: SITE_DIR без index.html и SITE_URL без https отклоняются', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-'));
  let e = sc.productionEnvErrors({ NODE_ENV: 'production', SITE_DIR: dir, SITE_URL: 'https://example.ru' });
  assert.ok(e.some((m) => m.includes('index.html')));
  fs.writeFileSync(path.join(dir, 'index.html'), '<html></html>');
  e = sc.productionEnvErrors({ NODE_ENV: 'production', SITE_DIR: dir, SITE_URL: 'http://example.ru' });
  assert.ok(e.some((m) => m.includes('SITE_URL')));
  e = sc.productionEnvErrors({ NODE_ENV: 'production', SITE_DIR: dir, SITE_URL: 'https://example.ru' });
  assert.deepStrictEqual(e, []);
});

test('не-строка и слишком длинный (>72 байт) пароль отклоняются', () => {
  for (const v of [undefined, null, 12345678901234, {}, ['abcdefghijkl']]) {
    assert.ok(sc.weakPasswordReason(v), `должен отклоняться: ${JSON.stringify(v)}`);
  }
  assert.ok(sc.weakPasswordReason('Ж'.repeat(40) + 'x!7'));
  assert.strictEqual(sc.weakPasswordReason('k7#Vq9-' + 'a'.repeat(30)), null);
});
