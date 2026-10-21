// db.js — подключение к SQLite и создание таблиц при первом запуске.
const path = require('path');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, 'data', 'ryazdetailing.db');
// На чистой установке папки data/ нет (в архив и репозиторий её не кладут) — создаём сами.
require('fs').mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// --- Логи действий администраторов (раньше были только в localStorage —
// каждый админ видел только свои собственные действия, в своём браузере) ---
db.exec(`
  CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_login TEXT NOT NULL,
    action TEXT NOT NULL,
    entity_id TEXT,
    details TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// --- Чёрный список (номера, которым отказано в записи) ---
db.exec(`
  CREATE TABLE IF NOT EXISTS blacklist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT NOT NULL,
    phone_normalized TEXT NOT NULL,
    reason TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);
db.exec("CREATE INDEX IF NOT EXISTS idx_blacklist_phone ON blacklist(phone_normalized)");

// --- Таблица администраторов ---
db.exec(`
  CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    login TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'manager',
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);
const adminCols = db.prepare("PRAGMA table_info(admins)").all().map((c) => c.name);
if (!adminCols.includes('active')) {
  db.exec("ALTER TABLE admins ADD COLUMN active INTEGER NOT NULL DEFAULT 1");
}

// --- Таблица заявок на запись ---
// Уникальный индекс на (date, time) — защита от двойной записи на один слот.
db.exec(`
  CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    service TEXT,
    date TEXT NOT NULL,          -- формат YYYY-MM-DD
    time TEXT NOT NULL,          -- формат HH:MM
    car TEXT,                    -- гос. номер автомобиля (необязательно)
    comment TEXT,                -- комментарий клиента
    admin_comment TEXT,          -- внутренний комментарий администратора
    pay TEXT NOT NULL DEFAULT 'none',   -- none | prepay | paid | refund
    status TEXT NOT NULL DEFAULT 'new', -- new | confirmed | inwork | done | cancelled | deleted | nodial
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// На случай обновления уже существующей базы без новых колонок.
const bookingCols = db.prepare("PRAGMA table_info(bookings)").all().map((c) => c.name);
for (const [col, def] of [
  ['car', "ALTER TABLE bookings ADD COLUMN car TEXT"],
  ['admin_comment', "ALTER TABLE bookings ADD COLUMN admin_comment TEXT"],
  ['pay', "ALTER TABLE bookings ADD COLUMN pay TEXT NOT NULL DEFAULT 'none'"],
  // Финансовая модель: раньше «выручка» в админке каждый раз пересчитывалась
  // по ТЕКУЩЕЙ цене услуги из справочника — если цену потом меняли, отчёты
  // задним числом «переписывали» прошлую выручку. price теперь — снимок
  // цены на момент создания записи, а не постоянная ссылка на прайс.
  ['price', "ALTER TABLE bookings ADD COLUMN price INTEGER"],
  ['prepay_amount', "ALTER TABLE bookings ADD COLUMN prepay_amount INTEGER NOT NULL DEFAULT 0"],
  ['paid_amount', "ALTER TABLE bookings ADD COLUMN paid_amount INTEGER NOT NULL DEFAULT 0"],
  ['refund_amount', "ALTER TABLE bookings ADD COLUMN refund_amount INTEGER NOT NULL DEFAULT 0"],
]) {
  if (!bookingCols.includes(col)) db.exec(def);
}

db.exec(`DROP INDEX IF EXISTS idx_bookings_slot;`);
db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_slot
  ON bookings(date, time)
  WHERE status NOT IN ('cancelled', 'deleted');
`);

// --- Таблица сообщений с формы обратной связи (заявки/сообщения) ---
db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    phone TEXT,
    email TEXT,
    text TEXT,
    status TEXT NOT NULL DEFAULT 'new',  -- new | read | processed
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);
const messageCols = db.prepare("PRAGMA table_info(messages)").all().map((c) => c.name);
if (!messageCols.includes('status')) {
  db.exec("ALTER TABLE messages ADD COLUMN status TEXT NOT NULL DEFAULT 'new'");
}

// --- Таблица отзывов ---
db.exec(`
  CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    stars INTEGER NOT NULL,
    svc TEXT,                    -- услуга(и), которые оценивает отзыв
    text TEXT NOT NULL,
    date TEXT,                   -- отображаемая дата ("10 мая 2026")
    avatar TEXT,                 -- путь к файлу или base64 data URL
    photos TEXT,                 -- JSON-массив путей/base64 (до 3 фото)
    status TEXT NOT NULL DEFAULT 'new',  -- new | published | hidden
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// --- Сидирование стартовых отзывов (те, что раньше были захардкожены
// на странице reviews.html) — только при первом запуске с пустой таблицей.
function seedReviews() {
  const count = db.prepare('SELECT COUNT(*) AS n FROM reviews').get().n;
  if (count > 0) return;

  const base = [
    { name: 'Алексей С.', stars: 5, svc: 'Комплексная мойка', date: '15 мая 2026',
      text: 'Отличный сервис! Делал комплексную мойку и детейлинг кузова. Машина как новая — блеск и чистота в каждой детали. Рекомендую!',
      avatar: 'assets/Alexey S.webp', photos: ['assets/feedback 1.webp','assets/feedback 1.2.webp','assets/feedback 1.3.webp'] },
    { name: 'Дмитрий К.', stars: 5, svc: 'Химчистка салона', date: '10 мая 2026',
      text: 'Делал химчистку салона. Убрали все пятна и запахи, салон стал как новый. Профессиональный подход и приятный персонал.',
      avatar: 'assets/Dmitry K.webp', photos: ['assets/feedback 2.webp','assets/feedback 2.2.webp','assets/feedback 2.3.webp'] },
    { name: 'Мария П.', stars: 5, svc: 'Керамическое покрытие', date: '5 мая 2026',
      text: 'Покрытие керамикой — это лучшее решение! Кузов теперь защищён, вода просто скатывается, машина всегда чистая.',
      avatar: 'assets/Maria P.webp', photos: ['assets/feedback 3.webp','assets/feedback 3.2.webp'] },
    { name: 'Иван Т.', stars: 5, svc: 'Мойка дисков и шин', date: '2 мая 2026',
      text: 'Отличное место! Моют качественно, быстро и без царапин. Персонал вежливый, всё объяснили и подсказали.',
      avatar: 'assets/Ivan T.webp', photos: ['assets/feedback 4.webp','assets/feedback 4.2.webp','assets/feedback 4.3.webp'] },
    { name: 'Ольга В.', stars: 5, svc: 'Детейлинг кузова', date: '28 апреля 2026',
      text: 'Пользуюсь услугами не первый раз. Всегда остаюсь довольна результатом и уровнем сервиса!',
      avatar: 'assets/Olga V.webp', photos: ['assets/feedback 5.webp','assets/feedback 5.2.webp'] },
    { name: 'Сергей М.', stars: 5, svc: 'Полировка кузова', date: '25 апреля 2026',
      text: 'Делал полировку кузова и бронирование фар. Работа выполнена на высшем уровне. Спасибо команде РязДетейлинг!',
      avatar: 'assets/Sergey M.webp', photos: ['assets/feedback 6.webp','assets/feedback 6.2.webp'] },
  ];

  const insert = db.prepare(
    `INSERT INTO reviews (name, stars, svc, text, date, avatar, photos, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'published')`
  );
  for (const r of base) {
    insert.run(r.name, r.stars, r.svc, r.text, r.date, r.avatar, JSON.stringify(r.photos));
  }
  console.log(`[db] Добавлено стартовых отзывов: ${base.length}`);
}

seedReviews();

// --- Таблица услуг ---
db.exec(`
  CREATE TABLE IF NOT EXISTS services (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    price INTEGER NOT NULL,
    dur TEXT,
    desc TEXT,
    discount INTEGER NOT NULL DEFAULT 0,
    full_desc TEXT,
    photo TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// --- Сидирование стандартных 10 услуг с теми же ID, что уже захардкожены
// в data-svc-id="N" по всему сайту (booking.html, services.html, index.html) —
// только при первом запуске с пустой таблицей.
function seedServices() {
  const count = db.prepare('SELECT COUNT(*) AS n FROM services').get().n;
  if (count > 0) return;

  const base = [
    { name:'Комплексная мойка', price:1200, dur:'60–90 мин', desc:'Кузов, диски, арки, коврики' },
    { name:'Детейлинг кузова', price:5000, dur:'3–8 ч', desc:'Полировка и восстановление блеска' },
    { name:'Химчистка салона', price:3000, dur:'4–6 ч', desc:'Ткань, кожа, пластик' },
    { name:'Мойка дисков и шин', price:600, dur:'30–60 мин', desc:'Удаление тормозной пыли' },
    { name:'Полировка фар', price:800, dur:'30–60 мин', desc:'Восстановление прозрачности' },
    { name:'Керамическое покрытие', price:9000, dur:'6–12 ч', desc:'Долговременная защита кузова' },
    { name:'Озонирование салона', price:1000, dur:'30–60 мин', desc:'Удаление запахов' },
    { name:'Мойка подкапотного пространства', price:1500, dur:'40–80 мин', desc:'Очистка двигателя' },
    { name:'Обработка защитными составами', price:1500, dur:'40–120 мин', desc:'Гидрофобные составы' },
    { name:'Оклейка PPF', price:15000, dur:'1–3 дня', desc:'Защита от сколов' },
  ];

  const insert = db.prepare(
    `INSERT INTO services (id, name, price, dur, desc, active) VALUES (?, ?, ?, ?, ?, 1)`
  );
  base.forEach((s, i) => insert.run(i + 1, s.name, s.price, s.dur, s.desc));
  console.log(`[db] Добавлено стандартных услуг: ${base.length}`);
}

seedServices();

// --- Таблица «Наши работы» (галерея до/после) ---
db.exec(`
  CREATE TABLE IF NOT EXISTS works (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    cat TEXT,                    -- категория (как в форме админки, рус.)
    time TEXT,                   -- время выполнения ("2 ч 30 мин")
    before_photo TEXT,
    after_photo TEXT,
    desc TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// --- Сидирование стандартных 9 работ (те же id и фото, что раньше были
// захардкожены в HTML gallery.html) — только при первом запуске.
function seedWorks() {
  const count = db.prepare('SELECT COUNT(*) AS n FROM works').get().n;
  if (count > 0) return;

  const base = [
    { name:'Комплексная мойка', cat:'Комплексная мойка', time:'2 ч 30 мин', before:'assets/before after 1.webp', after:'assets/before after 1.2.webp' },
    { name:'Химчистка салона', cat:'Химчистка салона', time:'4 ч', before:'assets/before after 2.webp', after:'assets/before after 2.2.webp' },
    { name:'Мойка дисков и шин', cat:'Мойка дисков и шин', time:'1 ч', before:'assets/before after 3.webp', after:'assets/before after 3.2.webp' },
    { name:'Полировка кузова', cat:'Полировка и защита', time:'6 ч', before:'assets/before after 4.webp', after:'assets/before after 4.2.webp' },
    { name:'Чистка подкапотного пространства', cat:'Комплексная мойка', time:'1 ч 30 мин', before:'assets/before after 5.webp', after:'assets/before after 5.2.webp' },
    { name:'Удаление царапин', cat:'Полировка и защита', time:'3 ч', before:'assets/before after 6.webp', after:'assets/before after 6.2.webp' },
    { name:'Восстановление кожи', cat:'Химчистка салона', time:'3 ч', before:'assets/before after 7.webp', after:'assets/before after 7.2.webp' },
    { name:'Керамическое покрытие', cat:'Детейлинг кузова', time:'7 ч', before:'assets/before after 8.webp', after:'assets/before after 8.2.webp' },
    { name:'Детейлинг интерьера', cat:'Детейлинг кузова', time:'5 ч', before:'assets/before after 9.webp', after:'assets/before after 9.2.webp' },
  ];

  const insert = db.prepare(
    `INSERT INTO works (id, name, cat, time, before_photo, after_photo, active) VALUES (?, ?, ?, ?, ?, ?, 1)`
  );
  base.forEach((w, i) => insert.run(i + 1, w.name, w.cat, w.time, w.before, w.after));
  console.log(`[db] Добавлено стандартных работ: ${base.length}`);
}

seedWorks();

// --- Таблица настроек сайта (контакты, тексты страниц, политика
// конфиденциальности) — простое хранилище ключ→JSON-значение, так как
// это одиночные объекты конфигурации, а не списки записей.
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

function seedSettings() {
  const count = db.prepare('SELECT COUNT(*) AS n FROM settings').get().n;
  if (count > 0) return;

  const contactDefaults = {
    phone: '+7 (4912) 99-00-99',
    email: 'zhora.fokin.06@mail.ru',
    addr: 'г. Рязань, Заводской проезд, 1',
    hours: 'Пн–Пт: 09:00–21:00, Сб–Вс: 10:00–20:00',
    vk: 'https://vk.com/tvoi_dilller',
    max: 'https://web.max.ru/',
    tg: '', wa: '',
    lat: '54.6296', lng: '39.7442',
    maplabel: 'РязДетейлинг — Заводской проезд, 1',
    bookingOn: true, wstart: '09:00', wend: '21:00', weStart: '10:00', weEnd: '20:00', weOff: false, slot: 60,
  };

  const insert = db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)`
  );
  insert.run('contacts', JSON.stringify(contactDefaults));
  insert.run('site_content', JSON.stringify({}));
  insert.run('privacy', JSON.stringify({
    date: '2026 г.', org: 'РязДетейлинг', email: contactDefaults.email,
    text: '',
    dataList: 'Имя и фамилия\nНомер телефона\nАдрес электронной почты\nНомер автомобиля (опционально)\nIP-адрес\nДанные браузера / устройства',
    purposes: 'Запись на услуги, обратная связь, улучшение сервиса',
    retention: '3 года с момента последнего обращения',
    thirdParty: 'Данные не передаются третьим лицам без согласия субъекта',
  }));
  console.log('[db] Добавлены настройки по умолчанию: contacts, site_content, privacy');
}

seedSettings();

// --- Сидирование администраторов при первом запуске ---
const { assertStrongPassword } = require('./utils/startupChecks');
function seedAdmins() {
  const count = db.prepare('SELECT COUNT(*) AS n FROM admins').get().n;
  if (count > 0) return;

  const seeds = [
    { login: process.env.ADMIN_LOGIN, password: process.env.ADMIN_PASSWORD, role: 'admin' },
    { login: process.env.MANAGER_LOGIN, password: process.env.MANAGER_PASSWORD, role: 'manager' },
  ];

  const insert = db.prepare(
    'INSERT INTO admins (login, password_hash, role) VALUES (?, ?, ?)'
  );

  for (const s of seeds) {
    if (!s.login || !s.password) continue;
    assertStrongPassword(s.role === 'admin' ? 'ADMIN_PASSWORD' : 'MANAGER_PASSWORD', s.password);
    const hash = bcrypt.hashSync(s.password, 12);
    insert.run(s.login, hash, s.role);
    console.log(`[db] Создан администратор: ${s.login} (роль: ${s.role})`);
  }
}

seedAdmins();

// Версионируемые изменения схемы (slug услуг, индексы и далее) — см. migrations/.
require('./migrations/runner').runMigrations(db);

module.exports = db;
