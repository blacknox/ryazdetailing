// utils/migrateImages.js — одноразовый (идемпотентный) перенос старых base64-фото
// из SQLite в файлы uploads/. Запускается при старте сервера: если data:-значений
// в таблицах нет, ничего не делает. Фото, которые не удалось сохранить
// (повреждены, больше 2 МБ), остаются как есть — данные не теряются.
const db = require('../db');
const { saveBase64Image } = require('./imageStore');

function migrateTable(table, columns, subdir) {
  let moved = 0;
  let skipped = 0;
  for (const col of columns) {
    const rows = db.prepare(`SELECT id, ${col} AS v FROM ${table} WHERE ${col} LIKE 'data:image/%'`).all();
    for (const r of rows) {
      const saved = saveBase64Image(r.v, subdir);
      if (saved) {
        db.prepare(`UPDATE ${table} SET ${col} = ? WHERE id = ?`).run(saved, r.id);
        moved++;
      } else {
        skipped++;
      }
    }
  }
  return { moved, skipped };
}

function migrateBase64Images() {
  try {
    const s = migrateTable('services', ['photo'], 'services');
    const w = migrateTable('works', ['before_photo', 'after_photo'], 'works');
    const moved = s.moved + w.moved;
    const skipped = s.skipped + w.skipped;
    if (moved || skipped) {
      console.log(`[migrate] фото вынесены из базы в файлы: ${moved}` + (skipped ? `, не удалось: ${skipped}` : ''));
    }
    return { moved, skipped };
  } catch (err) {
    console.error('[migrate] Ошибка переноса фото (сервер продолжает работу):', err.message);
    return { moved: 0, skipped: 0 };
  }
}

module.exports = { migrateBase64Images };
