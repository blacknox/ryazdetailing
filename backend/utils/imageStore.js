// utils/imageStore.js — сохранение фото из отзывов как файлов на диске,
// а не base64-строк в самой базе.
//
// Фронтенд читает выбранные фото через FileReader как data: URI и шлёт их
// в JSON-теле запроса (без multipart/form-data) — поэтому здесь не нужен
// multer, просто декодируем base64 и пишем файл сами.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const UPLOADS_ROOT = path.join(__dirname, '..', 'uploads');

const ALLOWED = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

// 2 МБ на файл: сайт сам пережимает фото в JPEG перед отправкой, обычно это
// 200–500 КБ. Лимит тела запроса для /api/reviews (server.js) рассчитан на
// аватар + 3 фото по 2 МБ в base64.
const MAX_BYTES = 2 * 1024 * 1024;

// Проверяем реальную сигнатуру файла, а не только MIME из data:-URI — иначе под
// видом image/jpeg можно загрузить что угодно.
function matchesMagic(buf, mime) {
  const ascii = (a, b) => buf.subarray(a, b).toString('latin1');
  if (mime === 'image/jpeg') return buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  if (mime === 'image/png') return buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mime === 'image/webp') return buf.length > 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP';
  return false;
}

const DATA_URI_RE = /^data:([a-z0-9+.-]+\/[a-z0-9+.-]+);base64,(.+)$/i;

/**
 * Декодирует data:-URI и сохраняет как файл в uploads/<subdir>/.
 * Возвращает публичный путь ("/uploads/reviews/xxx.jpg") либо null,
 * если на входе не валидный data:-URI с разрешённым типом изображения —
 * вызывающий код сам решает, игнорировать это молча или вернуть ошибку.
 */
function decodeDataUri(dataUri) {
  if (typeof dataUri !== 'string') return null;
  const match = dataUri.match(DATA_URI_RE);
  if (!match) return null;

  const mime = match[1].toLowerCase();
  const ext = ALLOWED[mime];
  if (!ext) return null;

  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length === 0 || buffer.length > MAX_BYTES || !matchesMagic(buffer, mime)) return null;
  return { mime, ext, buffer };
}

function writeUnique(subdir, ext, buffer) {
  const dir = path.join(UPLOADS_ROOT, subdir);
  fs.mkdirSync(dir, { recursive: true });
  const filename = `${Date.now()}-${crypto.randomUUID()}.${ext}`;
  fs.writeFileSync(path.join(dir, filename), buffer);
  return `/uploads/${subdir}/${filename}`;
}

// Как есть, без перекодирования (используется только переносом старых base64-фото из БД).
function saveBase64Image(dataUri, subdir) {
  const img = decodeDataUri(dataUri);
  return img ? writeUnique(subdir, img.ext, img.buffer) : null;
}

// ── Оптимизация: любое загруженное фото → WebP ────────────────────────────────
// • уменьшаем до 1600 px по длинной стороне (больше на сайте не нужно, а оригинал с телефона — 4000+ px);
// • WebP обычно на 25–35% легче JPEG при том же виде;
// • поворот по EXIF применяется, а сами метаданные (в том числе GPS-координаты места съёмки) стираются;
// • файл, который не декодируется как картинка, отклоняется — заодно это проверка «настоящая ли это картинка».
// Если библиотека sharp не установилась (редкая платформа), сохраняем как есть — загрузка не ломается.
const MAX_SIDE = 1600;
// Защита от «бомб» из пикселей: файл на 2 МБ может распаковываться в сотни мегапикселей и съесть всю память.
const MAX_PIXELS = 30 * 1000 * 1000;
const WEBP_QUALITY = 80;
let sharpLib;
function getSharp() {
  if (sharpLib === undefined) {
    try {
      sharpLib = require('sharp');
      sharpLib.cache(false);      // не копить кэш в памяти — сервер может быть маленьким
      sharpLib.concurrency(1);
    } catch (e) {
      sharpLib = null;
      console.warn('[images] sharp недоступен — фото сохраняются без оптимизации:', e.message);
    }
  }
  return sharpLib;
}

/**
 * @returns {Promise<string|null>} публичный путь к WebP-файлу либо null, если на входе не картинка.
 */
async function saveImageOptimized(dataUri, subdir) {
  const img = decodeDataUri(dataUri);
  if (!img) return null;
  const sharp = getSharp();
  if (!sharp) return writeUnique(subdir, img.ext, img.buffer);
  try {
    const out = await sharp(img.buffer, { limitInputPixels: MAX_PIXELS, failOn: 'error' })
      .rotate()
      .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();
    return writeUnique(subdir, 'webp', out);
  } catch {
    return null; // повреждённый файл или «не картинка» с правильной сигнатурой
  }
}

/** Конвертирует уже лежащий в uploads/ файл в WebP (для scripts/optimize-uploads.js). */
async function optimizeStoredFile(publicPath) {
  const abs = resolveInsideUploads(publicPath);
  const sharp = getSharp();
  if (!abs || !sharp || !fs.existsSync(abs) || /\.webp$/i.test(abs)) return null;
  const out = await sharp(abs, { limitInputPixels: MAX_PIXELS, failOn: 'error' })
    .rotate()
    .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();
  const dir = path.dirname(publicPath);
  const newPublic = `${dir}/${path.basename(publicPath).replace(/\.[^.]+$/, '')}.webp`;
  const newAbs = resolveInsideUploads(newPublic);
  fs.writeFileSync(newAbs, out);
  return { path: newPublic, before: fs.statSync(abs).size, after: out.length };
}

/**
 * Переводит публичный путь ("/uploads/reviews/xxx.jpg") в абсолютный путь на диске,
 * но ТОЛЬКО если результат лежит строго внутри uploads/. Иначе — null.
 * Проверка через path.relative, а не startsWith: startsWith пропустил бы соседний
 * каталог "uploads-evil" (его путь тоже начинается с пути uploads), а "../" и
 * абсолютные пути path.relative выдаёт явно.
 */
function resolveInsideUploads(publicPath) {
  if (typeof publicPath !== 'string' || !publicPath.startsWith('/uploads/')) return null;
  const rel0 = publicPath.slice('/uploads/'.length);
  if (!rel0 || rel0.includes('\0')) return null;
  const abs = path.resolve(UPLOADS_ROOT, rel0);
  const rel = path.relative(UPLOADS_ROOT, abs);
  if (!rel || rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) return null;
  return abs;
}

/** Удаляет файл по его публичному пути ("/uploads/reviews/xxx.jpg"), если он наш. */
function deleteStoredImage(publicPath) {
  const abs = resolveInsideUploads(publicPath);
  if (!abs) return;
  // Синхронно: файл маленький, а так к моменту ответа клиенту файла гарантированно уже нет.
  // unlink не удаляет каталоги — только файлы; ошибки (файла нет) не важны.
  try { fs.unlinkSync(abs); } catch { /* уже удалён */ }
}

module.exports = { saveBase64Image, saveImageOptimized, optimizeStoredFile, deleteStoredImage, resolveInsideUploads, UPLOADS_ROOT };
