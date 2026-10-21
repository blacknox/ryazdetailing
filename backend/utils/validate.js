// utils/validate.js — общие проверки для записей: реальные даты, время Рязани,
// рабочие слоты, ограничения длины и экранирование для Telegram.
const db = require('../db');

// Рязань = Europe/Moscow (UTC+3 круглый год). toISOString() даёт дату по UTC,
// поэтому сравнивать её с локальной датой записи нельзя.
const TZ = 'Europe/Moscow';

function ryazanNow() {
  const p = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date());
  const g = (t) => p.find((x) => x.type === t).value;
  const hour = Number(g('hour')) % 24; // "24" в полночь у некоторых окружений
  return { date: `${g('year')}-${g('month')}-${g('day')}`, minutes: hour * 60 + Number(g('minute')) };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// Формат YYYY-MM-DD + реальная календарная дата (отсекает 2026-99-99 и 2099-02-31).
function isRealDate(s) {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

const { hoursForDate } = require('./hours');

function toMinutes(v) {
  const m = String(v || '').match(/^(\d{2}):(\d{2})$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
}

function workSettings() {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'contacts'").get();
  let c = {};
  try { c = row ? JSON.parse(row.value) : {}; } catch { c = {}; }
  const start = toMinutes(c.wstart || '09:00');
  const end = toMinutes(c.wend || '21:00');
  const slot = Number(c.slot) || 60;
  return {
    start: Number.isFinite(start) ? start : 540,
    end: Number.isFinite(end) ? end : 1260,
    slot: slot > 0 ? slot : 60,
    bookingOn: c.bookingOn !== false,
  };
}

// Часы работы на конкретную дату (будни/выходные) из настроек контактов.
function workDay(date) {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'contacts'").get();
  let c = {};
  try { c = row ? JSON.parse(row.value) : {}; } catch { c = {}; }
  return hoursForDate(c, date);
}

// Возвращает текст ошибки или null, если слот допустим для публичной записи.
function validateBookingSlot(date, time) {
  if (!isRealDate(date)) return 'Укажите корректную дату';
  if (!TIME_RE.test(time || '')) return 'Укажите корректное время (HH:MM)';
  const now = ryazanNow();
  if (date < now.date) return 'Нельзя записаться на прошедшую дату';
  const { closed, start, end, slot } = workDay(date);
  if (closed) return 'В этот день мы не работаем — выберите другую дату';
  const t = toMinutes(time);
  // Слот должен целиком помещаться в рабочий день и попадать в сетку слотов.
  if (t < start || t + slot > end || (t - start) % slot !== 0) {
    return 'Выбранное время не входит в доступные слоты';
  }
  if (date === now.date && t <= now.minutes) return 'Нельзя выбрать уже прошедшее время';
  return null;
}


// Ручная запись (режим оператора) — правила отличаются от публичной формы, но
// явные и записываются в журнал:
//  • дата/время должны быть реальными (как и везде);
//  • прошедшая дата — только admin (внесение визитов задним числом);
//  • время вне рабочего дня — только admin (особый случай, ночной заказ и т.п.);
//  • сетка слотов НЕ требуется (оператор может записать на 10:30);
//  • занятость времени всё равно проверяет уникальный индекс в БД.
// Возвращает { error } для отказа либо { flags } — список отклонений для журнала.
function checkManualSlot(date, time, role) {
  if (!isRealDate(date)) return { error: 'Некорректная дата' };
  if (!TIME_RE.test(time || '')) return { error: 'Некорректное время (HH:MM)' };
  const flags = [];
  const now = ryazanNow();
  const { closed, start, end } = workDay(date);
  const t = toMinutes(time);
  if (date < now.date) {
    if (role !== 'admin') return { error: 'Запись на прошедшую дату может внести только администратор' };
    flags.push('прошедшая дата');
  }
  if (closed || t < start || t >= end) {
    if (role !== 'admin') return { error: 'Время вне рабочего дня — такую запись может внести только администратор' };
    flags.push(closed ? 'выходной день' : 'вне рабочих часов');
  }
  return { flags };
}

// Ограничения длины текстовых полей (защита от мусора и раздувания БД).
const LIMITS = { name: 80, phone: 20, car: 12, comment: 1000, service: 120, email: 120, text: 3000 };

function tooLong(fields) {
  for (const [key, value] of Object.entries(fields)) {
    if (value != null && String(value).length > (LIMITS[key] || 500)) return key;
  }
  return null;
}

// Telegram с parse_mode=HTML: пользовательский текст обязан быть экранирован.
function escTg(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

module.exports = { ryazanNow, isRealDate, validateBookingSlot, checkManualSlot, workSettings, tooLong, LIMITS, escTg, DATE_RE, TIME_RE };
