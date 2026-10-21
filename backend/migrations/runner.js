// migrations/runner.js — применяет файлы NNN_*.sql / NNN_*.js по порядку, по одному разу.
// Каждая миграция выполняется в транзакции: либо применилась целиком, либо не оставила следов.
// Состояние хранится в таблице schema_migrations.
const fs = require('fs');
const path = require('path');

function runMigrations(db, dir = __dirname) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  const done = new Set(db.prepare('SELECT name FROM schema_migrations').all().map((r) => r.name));
  const files = fs.readdirSync(dir).filter((f) => /^\d+_.+\.(sql|js)$/.test(f)).sort();
  const applied = [];
  for (const file of files) {
    if (done.has(file)) continue;
    const full = path.join(dir, file);
    const apply = db.transaction(() => {
      if (file.endsWith('.sql')) db.exec(fs.readFileSync(full, 'utf8'));
      else require(full).up(db);
      db.prepare('INSERT INTO schema_migrations (name) VALUES (?)').run(file);
    });
    apply(); // при ошибке транзакция откатится, ошибка уйдёт наверх и сервер не стартует «на половине схемы»
    applied.push(file);
  }
  if (applied.length) console.log(`[migrate] применены миграции: ${applied.join(', ')}`);
  return applied;
}

module.exports = { runMigrations };
