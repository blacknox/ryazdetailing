// Сроки хранения из политики конфиденциальности действительно исполняются.
const test = require('node:test');
const assert = require('node:assert');
const Database = require('better-sqlite3');
const { runRetention, readConfig, ANON_NAME } = require('../../utils/retention');

function makeDb() {
  const db = new Database(':memory:');
  db.exec(`CREATE TABLE bookings (id INTEGER PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL, service TEXT, date TEXT NOT NULL, time TEXT, car TEXT, comment TEXT, admin_comment TEXT, status TEXT DEFAULT 'done', price INTEGER, created_at TEXT NOT NULL);
    CREATE TABLE messages (id INTEGER PRIMARY KEY, name TEXT, phone TEXT, email TEXT, text TEXT, created_at TEXT NOT NULL);
    CREATE TABLE logs (id INTEGER PRIMARY KEY, admin_login TEXT, action TEXT, created_at TEXT NOT NULL);`);
  return db;
}
const NOW = new Date('2026-10-17T12:00:00Z'), cfg = { bookingsMonths: 36, messagesMonths: 36, logsDays: 365 };
const addB = (db, id, name, phone, date, created) => db.prepare("INSERT INTO bookings (id,name,phone,service,date,time,car,comment,admin_comment,price,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)").run(id, name, phone, 'Мойка', date, '10:00', 'А123ВС62', 'коммент', 'внутр', 1000, created);

test('заявка старше 36 месяцев обезличивается, финансовые поля остаются', () => {
  const db = makeDb(); addB(db, 1, 'Иван', '+7 (910) 000-00-01', '2023-05-01', '2023-04-20 10:00:00');
  const r = runRetention(db, cfg, NOW); assert.strictEqual(r.bookingsAnonymized, 1);
  const b = db.prepare('SELECT * FROM bookings WHERE id=1').get();
  assert.strictEqual(b.name, ANON_NAME); assert.strictEqual(b.phone, ''); assert.strictEqual(b.car, null); assert.strictEqual(b.comment, null); assert.strictEqual(b.admin_comment, null);
  assert.strictEqual(b.price, 1000); assert.strictEqual(b.service, 'Мойка'); assert.strictEqual(b.date, '2023-05-01'); assert.strictEqual(b.status, 'done');
});
test('свежие заявки не трогаются', () => {
  const db = makeDb(); addB(db, 1, 'Иван', '+7 (910) 000-00-01', '2026-09-01', '2026-08-20 10:00:00');
  assert.strictEqual(runRetention(db, cfg, NOW).bookingsAnonymized, 0); assert.strictEqual(db.prepare('SELECT name FROM bookings').get().name, 'Иван');
});
test('«с момента последнего обращения»: у клиента есть свежая заявка → старые не обезличиваются', () => {
  const db = makeDb(); addB(db, 1, 'Иван', '+7 (910) 000-00-01', '2022-01-10', '2022-01-01 10:00:00'); addB(db, 2, 'Иван', '+7 (910) 000-00-01', '2026-10-01', '2026-09-20 10:00:00');
  assert.strictEqual(runRetention(db, cfg, NOW).bookingsAnonymized, 0);
});
test('повторный запуск ничего не меняет (идемпотентность), обезличенные записи не мешают друг другу', () => {
  const db = makeDb(); addB(db, 1, 'А', '+7 (910) 000-00-01', '2022-01-10', '2022-01-01 10:00:00'); addB(db, 2, 'Б', '+7 (910) 000-00-02', '2022-02-10', '2022-02-01 10:00:00');
  assert.strictEqual(runRetention(db, cfg, NOW).bookingsAnonymized, 2); assert.strictEqual(runRetention(db, cfg, NOW).bookingsAnonymized, 0);
});
test('сообщения старше срока удаляются, свежие и принадлежащие активному клиенту — остаются', () => {
  const db = makeDb(); addB(db, 1, 'Иван', '+7 (910) 000-00-01', '2026-10-01', '2026-09-20 10:00:00');
  const m = db.prepare('INSERT INTO messages (name, phone, text, created_at) VALUES (?,?,?,?)');
  m.run('Старый', '+7 (910) 000-00-09', 'x', '2022-01-01 10:00:00'); m.run('Свежий', '+7 (910) 000-00-08', 'x', '2026-10-10 10:00:00'); m.run('Активный', '+7 (910) 000-00-01', 'x', '2022-01-01 10:00:00'); m.run('Без телефона', null, 'x', '2021-01-01 10:00:00');
  assert.strictEqual(runRetention(db, cfg, NOW).messagesDeleted, 2);
  assert.deepStrictEqual(db.prepare('SELECT name FROM messages ORDER BY id').all().map((x) => x.name), ['Свежий', 'Активный']);
});
test('журнал действий старше 365 дней удаляется', () => {
  const db = makeDb(); const l = db.prepare('INSERT INTO logs (admin_login, action, created_at) VALUES (?,?,?)');
  l.run('a', 'old', '2025-10-01 10:00:00'); l.run('a', 'new', '2026-09-01 10:00:00');
  assert.strictEqual(runRetention(db, cfg, NOW).logsDeleted, 1); assert.strictEqual(db.prepare('SELECT action FROM logs').get().action, 'new');
});
test('0 отключает правило; конфиг читается из окружения, мусор → значения по умолчанию', () => {
  const db = makeDb(); addB(db, 1, 'Иван', '+7 (910) 000-00-01', '2020-01-10', '2020-01-01 10:00:00');
  assert.strictEqual(runRetention(db, { bookingsMonths: 0, messagesMonths: 0, logsDays: 0 }, NOW).bookingsAnonymized, 0);
  assert.deepStrictEqual(readConfig({}), cfg);
  assert.deepStrictEqual(readConfig({ RETENTION_BOOKINGS_MONTHS: '12', RETENTION_LOGS_DAYS: 'abc', RETENTION_MESSAGES_MONTHS: '-5' }), { bookingsMonths: 12, messagesMonths: 36, logsDays: 365 });
});
