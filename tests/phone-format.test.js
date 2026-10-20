// Маска телефона: вставка номера целиком не должна менять номер (регрессия: «+7 » + «89101234567»).
const test = require('node:test');
const assert = require('node:assert');
const { rdFormatPhone: f } = require('../js/phone-format.js');

test('вставка целиком в поле с автопрефиксом «+7 » не искажает номер', () => {
  for (const pasted of ['+7 +7 (910) 123-45-67', '+7 89101234567', '+7 +79101234567', '+7 79101234567', '+7 9101234567']) {
    assert.strictEqual(f(pasted), '+7 (910) 123-45-67', pasted);
  }
});
test('вставка без префикса: 8…, 7…, +7…, 10 цифр', () => {
  for (const pasted of ['89101234567', '79101234567', '+79101234567', '9101234567', '8 (910) 123-45-67']) {
    assert.strictEqual(f(pasted), '+7 (910) 123-45-67', pasted);
  }
});
test('посимвольный набор даёт ту же маску на каждом шаге', () => {
  let v = '+7 ';
  const steps = [];
  for (const ch of '9101234567') { v = f(v + ch); steps.push(v); }
  assert.strictEqual(steps[0], '+7 (9');
  assert.strictEqual(steps[3], '+7 (910) 1');
  assert.strictEqual(steps[9], '+7 (910) 123-45-67');
});
test('стирание: промежуточные значения остаются корректными', () => {
  assert.strictEqual(f('+7 (910) 123-45-6'), '+7 (910) 123-45-6');
  assert.strictEqual(f('+7 (91'), '+7 (91');
  assert.strictEqual(f('+7 '), '+7');
  assert.strictEqual(f(''), '+7');
});
test('лишние цифры обрезаются до 11, буквы игнорируются', () => {
  assert.strictEqual(f('+7 (910) 123-45-67 99'), '+7 (910) 123-45-67');
  assert.strictEqual(f('+7 abc9101234567'), '+7 (910) 123-45-67');
});
test('номер 8-800 набирается без искажений', () => {
  assert.strictEqual(f('+7 (800) 555-35-35'), '+7 (800) 555-35-35');
  assert.strictEqual(f('88005553535'), '+7 (800) 555-35-35');
});
