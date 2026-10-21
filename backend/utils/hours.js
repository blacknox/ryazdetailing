// utils/hours.js — единый источник рабочего расписания.
// Расписание хранится структурно в settings.contacts:
//   wstart/wend     — Пн–Пт;  weStart/weEnd — Сб–Вс;  weOff — Сб–Вс выходной;
//   slot            — длительность слота, минут.
// Текст «График работы» и слоты записи выводятся из этих полей, поэтому
// расхождений между страницами и сервером быть не может.
// Если поля выходных не заданы (старая БД) — берём 10:00–20:00, как в опубликованном графике.

const DEFAULTS = { wstart: '09:00', wend: '21:00', weStart: '10:00', weEnd: '20:00', slot: 60 };

function toMinutes(v) {
  const m = String(v || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return NaN;
  const h = Number(m[1]), min = Number(m[2]);
  return h > 23 || min > 59 ? NaN : h * 60 + min;
}

function pad(t) { return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); }

function norm(c) {
  c = c || {};
  const pick = (v, d) => (Number.isFinite(toMinutes(v)) ? toMinutes(v) : toMinutes(d));
  const slot = Number(c.slot) > 0 ? Number(c.slot) : DEFAULTS.slot;
  return {
    wk: { start: pick(c.wstart, DEFAULTS.wstart), end: pick(c.wend, DEFAULTS.wend) },
    we: { start: pick(c.weStart, DEFAULTS.weStart), end: pick(c.weEnd, DEFAULTS.weEnd), off: c.weOff === true },
    slot,
  };
}

// Часы работы на конкретную дату YYYY-MM-DD: { closed, start, end, slot } (минуты от полуночи).
function hoursForDate(c, date) {
  const n = norm(c);
  const dow = new Date(date + 'T00:00:00Z').getUTCDay(); // 0 = вс, 6 = сб
  const weekend = dow === 0 || dow === 6;
  if (weekend) return { closed: n.we.off, start: n.we.start, end: n.we.end, slot: n.slot };
  return { closed: false, start: n.wk.start, end: n.wk.end, slot: n.slot };
}

// Человекочитаемый график, например «Пн–Пт: 09:00–21:00, Сб–Вс: 10:00–20:00».
function buildHoursText(c) {
  const n = norm(c);
  const wk = `${pad(n.wk.start)}–${pad(n.wk.end)}`;
  if (n.we.off) return `Пн–Пт: ${wk}, Сб–Вс: выходной`;
  const we = `${pad(n.we.start)}–${pad(n.we.end)}`;
  return we === wk ? `Ежедневно: ${wk}` : `Пн–Пт: ${wk}, Сб–Вс: ${we}`;
}

// Проверка значений при сохранении настроек; возвращает текст ошибки или null.
function validateHoursSettings(c) {
  for (const k of ['wstart', 'wend', 'weStart', 'weEnd']) {
    if (c[k] !== undefined && c[k] !== '' && !Number.isFinite(toMinutes(c[k]))) return `Некорректное время в поле ${k} (нужен формат ЧЧ:ММ)`;
  }
  const n = norm(c);
  if (n.wk.start >= n.wk.end) return 'Для будней начало работы должно быть раньше конца';
  if (!n.we.off && n.we.start >= n.we.end) return 'Для выходных начало работы должно быть раньше конца';
  if (c.slot !== undefined && (!(Number(c.slot) >= 15 && Number(c.slot) <= 240))) return 'Слот должен быть от 15 до 240 минут';
  return null;
}

module.exports = { hoursForDate, buildHoursText, validateHoursSettings, toMinutes, DEFAULTS };
