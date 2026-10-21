// validators/images.js — какие значения вообще можно хранить как «путь к картинке».
// Разрешено только:
//   • собственные статичные файлы:  /assets/…  или  assets/…
//   • загруженные через админку:    /uploads/…
//   • data:image/(jpeg|png|webp);base64,… — только как ВХОД: сервер сразу
//     превращает его в файл и в базу пишет уже путь, а не сами байты.
// Всё остальное (javascript:, file:, ftp:, http(s) с чужих доменов, «..») — отказ.
const { saveImageOptimized } = require('../utils/imageStore');

const MAX_PATH = 300;
const EXT_RE = /\.(jpe?g|png|webp|avif|gif|svg)$/i;

function isAllowedImagePath(v) {
  if (typeof v !== 'string' || v.length === 0 || v.length > MAX_PATH) return false;
  if (!/^\/?(assets|uploads)\//.test(v)) return false;
  // Никаких выходов из каталога, обратных слэшей, схем (a:b), двойных слэшей,
  // управляющих символов и «%2e%2e»-обходов.
  if (v.includes('..') || v.includes('\\') || v.includes('//') || /%2e|%2f|%5c/i.test(v)) return false;
  if (/[\u0000-\u001f"'<>`()]/.test(v)) return false;
  if (/^\/?[a-z][a-z0-9+.-]*:/i.test(v)) return false;
  return EXT_RE.test(v);
}

const DATA_RE = /^data:image\/(jpeg|png|webp);base64,/i;

/**
 * Приводит значение поля-картинки к безопасному виду.
 * @returns {Promise<{value: string|null}|{error: string}>}
 *   value === null  — «нет картинки» (пустая строка / null);
 *   новый файл из data:-URI сжимается в WebP (до 1600 px) и сохраняется в uploads/<subdir>/ (файл можно потом удалить через
 *   deleteStoredImage, если запись так и не попала в БД).
 */
async function resolveImage(value, subdir, label = 'Фото') {
  if (value === undefined || value === null || value === '') return { value: null };
  if (typeof value !== 'string') return { error: `${label}: некорректное значение` };
  if (DATA_RE.test(value)) {
    const saved = await saveImageOptimized(value, subdir);
    return saved
      ? { value: saved, created: saved }
      : { error: `${label}: нужен корректный JPEG, PNG или WebP размером до 2 МБ` };
  }
  if (isAllowedImagePath(value)) return { value, created: null };
  return { error: `${label}: недопустимый адрес изображения` };
}

module.exports = { isAllowedImagePath, resolveImage };
