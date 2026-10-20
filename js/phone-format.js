// js/phone-format.js — единая маска российского телефона для сайта и админки.
// Правило: на фокусе в поле автоматически ставится «+7 ». Если пользователь вставляет номер ЦЕЛИКОМ
// («+7 910…», «+7910…», «8 910…»), то код страны в вставленном тексте не должен считаться ещё раз:
// раньше «+7 » + «89101234567» превращалось в чужой номер «+7 (789) 101-23-45», который проходил проверку
// «11 цифр» и молча попадал в заявку.
function rdFormatPhone(val) {
  const v = String(val == null ? '' : val);
  let digits;
  if (/^\s*\+7/.test(v)) {
    // Автоподставленный «+7» отбрасываем и смотрим на то, что идёт после него.
    digits = v.replace(/^\s*\+7/, '').replace(/\D/g, '');
    // Вставили номер целиком (с 7 или 8 в начале): лишний код страны убираем.
    if (digits.length === 11 && /^[78]/.test(digits)) digits = digits.slice(1);
    digits = '7' + digits;
  } else {
    digits = v.replace(/\D/g, '');
    if (digits.startsWith('8')) digits = '7' + digits.slice(1);
    if (!digits.startsWith('7')) digits = '7' + digits;
  }
  digits = digits.slice(0, 11);
  let r = '+7';
  if (digits.length > 1) r += ' (' + digits.slice(1, 4);
  if (digits.length >= 4) r += ') ' + digits.slice(4, 7);
  if (digits.length >= 7) r += '-' + digits.slice(7, 9);
  if (digits.length >= 9) r += '-' + digits.slice(9, 11);
  return r;
}
if (typeof module !== 'undefined' && module.exports) module.exports = { rdFormatPhone };
