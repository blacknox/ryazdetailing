// Политика конфиденциальности должна соответствовать фактическому поведению системы.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const policy = fs.readFileSync(path.join(__dirname, '..', 'privacy.html'), 'utf8').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

test('политика называет сроки, которые исполняет бэкенд (36 мес. заявки/сообщения, 365 дней журнал, 14 дней логи сервера)', () => {
  for (const frag of ['36 месяцев', '365 дней', '14 дней']) assert.ok(policy.includes(frag), 'нет срока: ' + frag);
});
test('политика раскрывает IP-адреса, Telegram, Яндекс.Карты и резервные копии', () => {
  for (const frag of ['IP-адрес', 'Telegram', 'Яндекс.Карт', 'резервные копии', '12 месяцев']) assert.ok(policy.includes(frag), 'не упомянуто: ' + frag);
});
test('политика описывает права субъекта и способ обращения', () => {
  for (const frag of ['удаления', 'отозвать согласие', '+7 (4912) 99-00-99']) assert.ok(policy.includes(frag), 'нет: ' + frag);
});
test('нет устаревшего утверждения, что сайт вообще не использует cookie', () => {
  assert.ok(!/сайт не использует (файлы )?cookie\./.test(policy));
});
