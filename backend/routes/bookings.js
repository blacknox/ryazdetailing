// routes/bookings.js — онлайн-запись: публичные и админские маршруты.
const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { notifyTelegram, formatBookingMessage } = require('../telegram');
const { normalizePhone } = require('../utils/phone');
const { addLog, diffFields } = require('../utils/logs');

const { isRealDate, validateBookingSlot, checkManualSlot, tooLong, ryazanNow, DATE_RE, TIME_RE } = require('../utils/validate');
const { validateBookingFinancials } = require('../validators/booking');

const router = express.Router();

const PHONE_RE = /^[\d\s()+\-]{6,20}$/;

// Не больше 5 заявок за 10 минут с одного IP — защита от спама/накрутки формы.
const bookingLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много заявок подряд. Попробуйте через несколько минут или позвоните нам.' },
});

// --- GET /api/bookings/availability?date=YYYY-MM-DD ---
// Возвращает список уже занятых времён на указанную дату (для фронтенда,
// чтобы показать клиенту, какие слоты недоступны, ДО отправки формы).
router.get('/availability', (req, res) => {
  const { date } = req.query;
  if (!isRealDate(date)) {
    return res.status(400).json({ error: 'Некорректная дата, ожидается формат YYYY-MM-DD' });
  }

  const rows = db
    .prepare(`SELECT time FROM bookings WHERE date = ? AND status NOT IN ('cancelled', 'deleted')`)
    .all(date);

  res.json({ date, bookedTimes: rows.map((r) => r.time) });
});

// --- POST /api/bookings ---
// Создаёт заявку. Слот (date+time) защищён уникальным индексом в БД —
// при гонке двух одновременных запросов на одно время второй получит 409.
router.post('/', bookingLimiter, async (req, res) => {
  const { name, phone, service, serviceId, date, time, comment, car, extras } = req.body || {};

  // «Онлайн-запись включена» в настройках раньше проверялась ТОЛЬКО на
  // фронтенде — и то неработающе (см. комментарий в booking.html): форма
  // читала localStorage-ключ, который для настоящего посетителя никогда не
  // был заполнен, поэтому выключатель вообще ни на что не влиял. Здесь —
  // настоящая проверка, которую нельзя обойти прямым запросом к API.
  const settingsRow = db.prepare("SELECT value FROM settings WHERE key = 'contacts'").get();
  if (settingsRow) {
    try {
      const contacts = JSON.parse(settingsRow.value);
      if (contacts && contacts.bookingOn === false) {
        return res.status(403).json({ error: 'Онлайн-запись временно отключена. Пожалуйста, позвоните нам.' });
      }
    } catch (e) { /* некорректный JSON в settings — не блокируем запись из-за этого */ }
  }

  if (!name || String(name).trim().length < 2) {
    return res.status(400).json({ error: 'Укажите имя' });
  }
  if (!phone || !PHONE_RE.test(phone)) {
    return res.status(400).json({ error: 'Укажите корректный телефон' });
  }
  const long = tooLong({ name, phone, car, comment, service });
  if (long) {
    return res.status(400).json({ error: 'Слишком длинное значение в поле: ' + long });
  }

  // Дата, рабочие часы, сетка слотов, «прошедшее время» — всё проверяет сервер,
  // фронтенд лишь удобство и источником истины не является.
  const slotError = validateBookingSlot(date, time);
  if (slotError) {
    return res.status(400).json({ error: slotError });
  }

  // Чёрный список раньше проверялся только в голове администратора — сама
  // форма записи его не видела и принимала бронь от заблокированного номера.
  const blocked = db
    .prepare('SELECT id FROM blacklist WHERE phone_normalized = ?')
    .get(normalizePhone(phone));
  if (blocked) {
    return res.status(403).json({ error: 'Не удалось создать запись. Свяжитесь с администратором по телефону.' });
  }

  // Услуга берётся из БД (по id, либо по точному названию), должна существовать
  // и быть активной. В заявку пишем название и цену ИЗ БД, а не текст клиента.
  const svcRow = serviceId
    ? db.prepare('SELECT id, name, price, active FROM services WHERE id = ?').get(Number(serviceId))
    : (service ? db.prepare('SELECT id, name, price, active FROM services WHERE name = ?').get(String(service).trim()) : null);
  if (!svcRow || !svcRow.active) {
    return res.status(400).json({ error: 'Выбранная услуга недоступна' });
  }
  // Цена фиксируется один раз, в момент создания заявки — снимок текущей
  // цены услуги, а не постоянная ссылка на прайс (см. комментарий в db.js).
  const price = svcRow.price;

  // «Дополнительные услуги» с формы записи: принимаем только реально существующие активные услуги
  // (по точному названию, без повторов и без самой основной), не больше 10. Мусор в списке не мешает записи.
  // Хранятся в комментарии заявки — так они видны и в админке, и в уведомлении Telegram.
  let extraNames = [];
  if (Array.isArray(extras)) {
    const asked = [...new Set(extras.filter((x) => typeof x === 'string').map((x) => x.trim()).filter((x) => x && x.length <= 120 && x !== svcRow.name))].slice(0, 10);
    if (asked.length) {
      const known = new Set(
        db.prepare(`SELECT name FROM services WHERE active = 1 AND name IN (${asked.map(() => '?').join(',')})`).all(...asked).map((r) => r.name)
      );
      extraNames = asked.filter((x) => known.has(x));
    }
  }
  const commentText = comment ? String(comment).trim() : '';
  const finalComment = extraNames.length
    ? `Доп. услуги: ${extraNames.join(', ')}${commentText ? '\n' + commentText : ''}`
    : (commentText || null);

  try {
    const info = db
      .prepare(
        `INSERT INTO bookings (name, phone, service, date, time, comment, car, price)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        String(name).trim(),
        String(phone).trim(),
        svcRow.name,
        date,
        time,
        finalComment,
        car ? String(car).trim() : null,
        price
      );

    const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(info.lastInsertRowid);

    // Уведомление отправляем асинхронно, не блокируя ответ клиенту.
    notifyTelegram(formatBookingMessage(booking)).catch(() => {});

    res.status(201).json({ ok: true, booking });
  } catch (err) {
    if (String(err.message).includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: 'Это время уже занято, выберите другое' });
    }
    console.error('[bookings] Ошибка создания записи:', err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// --- GET /api/bookings (админ) ---
// Список заявок, опционально фильтр по дате и статусу.
router.get('/', requireAuth, (req, res) => {
  const { date, status } = req.query;
  let sql = 'SELECT * FROM bookings WHERE 1=1';
  const params = [];

  if (date) {
    sql += ' AND date = ?';
    params.push(date);
  }
  if (status) {
    sql += ' AND status = ?';
    params.push(status);
  }
  sql += ' ORDER BY date DESC, time DESC';

  const rows = db.prepare(sql).all(...params);
  res.json({ bookings: rows });
});

// --- PATCH /api/bookings/:id (админ) ---
// Смена статуса заявки: confirmed | done | cancelled, либо перенос даты/времени.
router.patch('/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  const {
    status, date, time, name, phone, service, car, comment, admin_comment, pay,
    price, prepay_amount, paid_amount, refund_amount,
  } = req.body || {};

  const existing = db.prepare('SELECT * FROM bookings WHERE id = ?').get(id);
  if (!existing) {
    return res.status(404).json({ error: 'Заявка не найдена' });
  }

  const allowedStatus = ['new', 'confirmed', 'inwork', 'done', 'cancelled', 'deleted', 'nodial'];
  if (status && !allowedStatus.includes(status)) {
    return res.status(400).json({ error: 'Некорректный статус' });
  }
  // «Удалить» заявку (статус deleted) может только администратор; менеджер переводит её в «Отменена».
  if (status === 'deleted' && existing.status !== 'deleted' && req.admin.role !== 'admin') {
    return res.status(403).json({ error: 'Удалять заявки может только администратор. Чтобы убрать заявку из работы, поставьте статус «Отменена».' });
  }
  const allowedPay = ['none', 'prepay', 'paid', 'refund'];
  if (pay && !allowedPay.includes(pay)) {
    return res.status(400).json({ error: 'Некорректный статус оплаты' });
  }
  if (date && !isRealDate(date)) {
    return res.status(400).json({ error: 'Некорректная дата' });
  }
  if (time && !TIME_RE.test(time)) {
    return res.status(400).json({ error: 'Некорректное время' });
  }
  const longField = tooLong({ name, phone, car, comment, admin_comment, service });
  if (longField) {
    return res.status(400).json({ error: 'Слишком длинное значение в поле: ' + longField });
  }
  // Смена телефона: те же правила, что при создании — формат и чёрный список.
  // Сравниваем по цифрам: форма админки шлёт телефон при каждом сохранении, и другая
  // маска (+7 (910)… / 8 910…) не должна считаться сменой номера.
  if (phone && normalizePhone(phone) !== normalizePhone(existing.phone)) {
    if (!PHONE_RE.test(String(phone).trim()) || normalizePhone(phone).length < 10) {
      return res.status(400).json({ error: 'Некорректный номер телефона' });
    }
    if (db.prepare('SELECT id FROM blacklist WHERE phone_normalized = ?').get(normalizePhone(phone))) {
      return res.status(403).json({ error: 'Этот номер в чёрном списке — сменить телефон на него нельзя' });
    }
  }
  // Смена услуги: только существующая из справочника (название берём каноническое из БД).
  // Если услугу не меняли, не проверяем: в старой заявке может быть услуга, которую позже переименовали.
  let serviceToSave = service ? String(service).trim() : null;
  if (service && String(service).trim() !== existing.service) {
    const svcRow = db.prepare('SELECT name FROM services WHERE name = ?').get(String(service).trim());
    if (!svcRow) {
      return res.status(400).json({ error: 'Такой услуги нет в справочнике. Выберите услугу из списка' });
    }
    serviceToSave = svcRow.name;
  }
  // Перенос записи: проверяем итоговую пару дата+время, даже если админ поменял
  // только одно из полей. Администратору разрешён нестандартный час (запись
  // по телефону вне сетки слотов), но не прошедшая дата и не занятый слот.
  const newDate = date || existing.date;
  const newTime = time || existing.time;
  const moved = newDate !== existing.date || newTime !== existing.time;
  let moveFlags = [];
  if (newDate !== existing.date || newTime !== existing.time) {
    if (newDate < ryazanNow().date) {
      return res.status(400).json({ error: 'Нельзя перенести запись на прошедшую дату' });
    }
    // Рабочие часы и выходные: менеджер переносит только в рабочее время, администратор —
    // и вне его (особый случай), с пометкой в журнале. Сетка слотов не требуется.
    const slot = checkManualSlot(newDate, newTime, req.admin.role);
    if (slot.error) {
      return res.status(slot.error.includes('администратор') ? 403 : 400).json({ error: slot.error });
    }
    moveFlags = slot.flags;
    const conflict = db
      .prepare("SELECT id FROM bookings WHERE date = ? AND time = ? AND id <> ? AND status NOT IN ('cancelled','deleted')")
      .get(newDate, newTime, id);
    if (conflict && !['cancelled', 'deleted'].includes(status || existing.status)) {
      return res.status(409).json({ error: 'Это время уже занято, выберите другое' });
    }
  }
  // Деньги: одна общая проверка для PATCH и ручного POST (validators/booking.js).
  // Менеджер цену не меняет; суммы — целые, refund <= полученных, оплата <= цены.
  const fin = validateBookingFinancials(
    { price: existing.price, prepay: existing.prepay_amount, paid: existing.paid_amount, refund: existing.refund_amount },
    { price, prepay_amount, paid_amount, refund_amount, pay },
    { role: req.admin.role, lockedPrice: existing.price }
  );
  if (fin.error) return res.status(fin.status).json({ error: fin.error });
  const money = fin.values; // null — деньги в запросе не менялись
  const derivedPay = money ? money.pay : null;

  try {
    db.prepare(
      `UPDATE bookings SET
         status = COALESCE(?, status),
         date = COALESCE(?, date),
         time = COALESCE(?, time),
         name = COALESCE(?, name),
         phone = COALESCE(?, phone),
         service = COALESCE(?, service),
         car = COALESCE(?, car),
         comment = COALESCE(?, comment),
         admin_comment = COALESCE(?, admin_comment),
         pay = COALESCE(?, pay),
         price = COALESCE(?, price),
         prepay_amount = COALESCE(?, prepay_amount),
         paid_amount = COALESCE(?, paid_amount),
         refund_amount = COALESCE(?, refund_amount)
       WHERE id = ?`
    ).run(
      status || null,
      date || null,
      time || null,
      name || null,
      phone || null,
      serviceToSave,
      car !== undefined ? car : null,
      comment !== undefined ? comment : null,
      admin_comment !== undefined ? admin_comment : null,
      derivedPay,
      money && money.price !== null ? money.price : null,
      money ? money.prepay : null,
      money ? money.paid : null,
      money ? money.refund : null,
      id
    );

    const updated = db.prepare('SELECT * FROM bookings WHERE id = ?').get(id);
    const statusChanged = status && status !== existing.status;
    const payChanged = derivedPay && derivedPay !== existing.pay;
    let logAction = 'Изменена запись';
    let logDetails = `${updated.name} — ${updated.date} ${updated.time}`;
    if (statusChanged) { logAction = 'Изменён статус записи'; logDetails = `${existing.status} → ${status}`; }
    else if (moved) {
      logAction = 'Перенесена запись';
      logDetails = `${existing.date} ${existing.time} → ${updated.date} ${updated.time}` + (moveFlags.length ? ` [исключение: ${moveFlags.join(', ')}]` : '');
    }
    else if (payChanged) { logAction = 'Изменена оплата записи'; logDetails = `${existing.pay} → ${derivedPay} (${updated.paid_amount}₽ из ${updated.price ?? '—'}₽)`; }
    addLog(req.admin, logAction, id, logDetails,
      diffFields(existing, updated, ['status', 'date', 'time', 'service', 'name', 'phone', 'car', 'pay', 'price', 'prepay_amount', 'paid_amount', 'refund_amount']));
    res.json({ ok: true, booking: updated });
  } catch (err) {
    if (String(err.message).includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: 'Это время уже занято, выберите другое' });
    }
    console.error('[bookings] Ошибка обновления записи:', err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// --- POST /api/bookings/manual (админ) ---
// Ручное добавление записи из админки (например, запись по телефону).
// Не ограничено rate-limit'ом формы на сайте.
router.post('/manual', requireAuth, (req, res) => {
  const { name, phone, service, date, time, comment, car, pay, status, price, prepay_amount, paid_amount, refund_amount } = req.body || {};

  if (!name || !phone || !date || !time) {
    return res.status(400).json({ error: 'Укажите имя, телефон, дату и время' });
  }
  if (!PHONE_RE.test(String(phone).trim()) || normalizePhone(phone).length < 10) {
    return res.status(400).json({ error: 'Некорректный номер телефона' });
  }
  const slot = checkManualSlot(date, time, req.admin.role);
  if (slot.error) return res.status(slot.error.includes('администратор') ? 403 : 400).json({ error: slot.error });
  const ALLOWED_STATUS = ['new', 'confirmed', 'inwork', 'done', 'cancelled', 'nodial'];
  const ALLOWED_PAY = ['none', 'prepay', 'paid', 'refund'];
  if (status && !ALLOWED_STATUS.includes(status)) return res.status(400).json({ error: 'Недопустимый статус' });
  if (pay && !ALLOWED_PAY.includes(pay)) return res.status(400).json({ error: 'Недопустимый статус оплаты' });
  // Чёрный список действует и для оператора: проверка в админке — только удобство.
  if (db.prepare('SELECT id FROM blacklist WHERE phone_normalized = ?').get(normalizePhone(phone))) {
    return res.status(403).json({ error: 'Этот номер в чёрном списке — запись невозможна' });
  }
  const longManual = tooLong({ name, phone, car, comment, service });
  if (longManual) return res.status(400).json({ error: 'Слишком длинное значение в поле: ' + longManual });

  // Услуга должна существовать в справочнике; в запись пишем каноническое
  // название и снимок цены из БД (как и в публичной форме).
  const svcRow = service
    ? db.prepare('SELECT name, price FROM services WHERE name = ?').get(String(service).trim())
    : null;
  if (service && !svcRow) {
    return res.status(400).json({ error: 'Такой услуги нет в справочнике. Выберите услугу из списка' });
  }
  // Те же финансовые правила, что и в PATCH (validators/booking.js): один источник истины.
  const fin = validateBookingFinancials(
    { price: svcRow ? svcRow.price : null, prepay: 0, paid: 0, refund: 0 },
    { price, prepay_amount, paid_amount, refund_amount, pay },
    { role: req.admin.role, lockedPrice: svcRow ? svcRow.price : null }
  );
  if (fin.error) return res.status(fin.status).json({ error: fin.error });
  const money = fin.values || { price: svcRow ? svcRow.price : null, prepay: 0, paid: 0, refund: 0, pay: 'none' };

  try {
    const info = db
      .prepare(
        `INSERT INTO bookings (name, phone, service, date, time, comment, car, pay, status, price, prepay_amount, paid_amount, refund_amount)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        String(name).trim(),
        String(phone).trim(),
        svcRow ? svcRow.name : null,
        date,
        time,
        comment ? String(comment).trim() : null,
        car ? String(car).trim() : null,
        money.pay,
        status || 'new',
        money.price,
        money.prepay,
        money.paid,
        money.refund
      );
    const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(info.lastInsertRowid);
    addLog(req.admin, 'Добавлена запись вручную', booking.id,
      `${booking.name} — ${booking.date} ${booking.time}` + (slot.flags.length ? ` [исключение: ${slot.flags.join(', ')}]` : ''));
    res.status(201).json({ ok: true, booking });
  } catch (err) {
    if (String(err.message).includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: 'Это время уже занято, выберите другое' });
    }
    console.error('[bookings] Ошибка ручного добавления записи:', err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

module.exports = router;
