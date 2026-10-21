// Одноразовая оптимизация уже загруженных фото: JPEG/PNG → WebP (до 1600 px, без EXIF/GPS),
// ссылки в базе обновляются, старые файлы удаляются.
//   node scripts/optimize-uploads.js --dry-run     — только показать, что и насколько уменьшится
//   node scripts/optimize-uploads.js               — выполнить
// ПЕРЕД запуском сделайте бэкап (deploy/backup.sh). Скрипт можно запускать повторно: WebP он пропускает.
const db = require('../db');
const { optimizeStoredFile, deleteStoredImage } = require('../utils/imageStore');
const DRY = process.argv.includes('--dry-run');

const targets = [
  { table: 'services', cols: ['photo'] },
  { table: 'works', cols: ['before_photo', 'after_photo'] },
  { table: 'reviews', cols: ['avatar'], json: ['photos'] },
];
const isConvertible = (p) => typeof p === 'string' && /^\/uploads\/.+\.(jpe?g|png)$/i.test(p);

(async () => {
  let files = 0, before = 0, after = 0, failed = 0;
  const convert = async (p) => {
    if (DRY) {
      const { resolveInsideUploads } = require('../utils/imageStore');
      const abs = resolveInsideUploads(p);
      if (!abs || !require('fs').existsSync(abs)) return null;
      const out = await require('sharp')(abs).rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
      return { path: p, before: require('fs').statSync(abs).size, after: out.length };
    }
    return optimizeStoredFile(p);
  };
  const note = (r) => { files++; before += r.before; after += r.after; };

  for (const t of targets) {
    for (const row of db.prepare(`SELECT * FROM ${t.table}`).all()) {
      const updates = {};
      const toDelete = [];
      for (const col of t.cols) {
        if (!isConvertible(row[col])) continue;
        try {
          const r = await convert(row[col]);
          if (!r) continue;
          note(r); updates[col] = r.path; toDelete.push(row[col]);
        } catch (e) { failed++; console.warn(`  пропущено ${row[col]}: ${e.message}`); }
      }
      for (const col of t.json || []) {
        let arr; try { arr = JSON.parse(row[col] || '[]'); } catch { continue; }
        if (!Array.isArray(arr) || !arr.some(isConvertible)) continue;
        const next = [];
        for (const p of arr) {
          if (!isConvertible(p)) { next.push(p); continue; }
          try {
            const r = await convert(p);
            if (r) { note(r); next.push(r.path); toDelete.push(p); } else next.push(p);
          } catch (e) { failed++; next.push(p); console.warn(`  пропущено ${p}: ${e.message}`); }
        }
        updates[col] = JSON.stringify(next);
      }
      const cols = Object.keys(updates);
      if (!cols.length) continue;
      if (!DRY) {
        db.prepare(`UPDATE ${t.table} SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`).run(...cols.map((c) => updates[c]), row.id);
        toDelete.forEach(deleteStoredImage); // удаляем старые файлы только ПОСЛЕ того, как база обновлена
      }
    }
  }
  const mb = (n) => (n / 1048576).toFixed(2);
  console.log(`${DRY ? '[пробный запуск] ' : ''}Файлов: ${files}, было ${mb(before)} МБ → стало ${mb(after)} МБ${before ? ` (−${Math.round((1 - after / before) * 100)}%)` : ''}${failed ? `, пропущено с ошибкой: ${failed}` : ''}.`);
})();
