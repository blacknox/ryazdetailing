// 002 — услугам нужен стабильный адрес для SEO (/services/<slug>/).
// Slug создаётся один раз и НЕ меняется при переименовании услуги: иначе ссылки,
// уже попавшие в поиск, начали бы вести в никуда.
const { uniqueSlug } = require('../utils/slug');

exports.up = (db) => {
  const cols = db.prepare('PRAGMA table_info(services)').all().map((c) => c.name);
  if (!cols.includes('slug')) db.exec('ALTER TABLE services ADD COLUMN slug TEXT');

  const taken = new Set(db.prepare('SELECT slug FROM services WHERE slug IS NOT NULL').all().map((r) => r.slug));
  const upd = db.prepare('UPDATE services SET slug = ? WHERE id = ?');
  for (const row of db.prepare('SELECT id, name FROM services WHERE slug IS NULL OR slug = \'\' ORDER BY id').all()) {
    const slug = uniqueSlug(row.name, (c) => taken.has(c));
    taken.add(slug);
    upd.run(slug, row.id);
  }
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_services_slug ON services(slug)');
};
