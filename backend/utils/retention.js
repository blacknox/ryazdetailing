// utils/retention.js — реальное исполнение сроков хранения из политики конфиденциальности.
//
// Что делает (раз в сутки и при старте):
//  • заявки: через RETENTION_BOOKINGS_MONTHS (по умолчанию 36) после последнего обращения клиента
//    обезличивает имя, телефон, номер авто и комментарии; услуга, дата, статус и суммы остаются
//    (нужны для финансовой отчётности, но человека по ним уже не определить);
//  • сообщения с формы обратной связи: удаляет через RETENTION_MESSAGES_MONTHS (36);
//  • журнал действий (логи админки, включая IP событий безопасности): удаляет через RETENTION_LOGS_DAYS (365).
// «Последнее обращение» считается по телефону: если клиент записывался недавно, его старые заявки не трогаем.
// Значение 0 отключает правило. Чёрный список и опубликованные отзывы не затрагиваются (см. политику).
const ANON_NAME = 'Данные удалены';

const cutoff = (now, { months = 0, days = 0 }) => {
  const d = new Date(now.getTime());
  if (months) d.setUTCMonth(d.getUTCMonth() - months);
  if (days) d.setUTCDate(d.getUTCDate() - days);
  return { date: d.toISOString().slice(0, 10), ts: d.toISOString().slice(0, 19).replace('T', ' ') };
};

function readConfig(env = process.env) {
  const n = (v, d) => (v === undefined || v === '' || !Number.isFinite(Number(v)) || Number(v) < 0 ? d : Math.floor(Number(v)));
  return {
    bookingsMonths: n(env.RETENTION_BOOKINGS_MONTHS, 36),
    messagesMonths: n(env.RETENTION_MESSAGES_MONTHS, 36),
    logsDays: n(env.RETENTION_LOGS_DAYS, 365),
  };
}

function runRetention(db, cfg = readConfig(), now = new Date()) {
  const out = { bookingsAnonymized: 0, messagesDeleted: 0, logsDeleted: 0 };
  const tx = db.transaction(() => {
    if (cfg.bookingsMonths > 0) {
      const c = cutoff(now, { months: cfg.bookingsMonths });
      out.bookingsAnonymized = db.prepare(`
        UPDATE bookings SET name = ?, phone = '', car = NULL, comment = NULL, admin_comment = NULL
        WHERE name != ? AND date < ? AND created_at < ?
          AND phone NOT IN (SELECT phone FROM bookings WHERE phone != '' AND (date >= ? OR created_at >= ?))
      `).run(ANON_NAME, ANON_NAME, c.date, c.ts, c.date, c.ts).changes;
    }
    if (cfg.messagesMonths > 0) {
      const c = cutoff(now, { months: cfg.messagesMonths });
      out.messagesDeleted = db.prepare(`
        DELETE FROM messages WHERE created_at < ?
          AND (phone IS NULL OR phone = '' OR phone NOT IN (SELECT phone FROM bookings WHERE phone != '' AND (date >= ? OR created_at >= ?)))
      `).run(c.ts, c.date, c.ts).changes;
    }
    if (cfg.logsDays > 0) {
      const c = cutoff(now, { days: cfg.logsDays });
      out.logsDeleted = db.prepare('DELETE FROM logs WHERE created_at < ?').run(c.ts).changes;
    }
  });
  tx();
  return out;
}

// Запуск по расписанию: через минуту после старта и далее раз в сутки.
function startRetentionSchedule(db, log = console.log) {
  const tick = () => {
    try {
      const r = runRetention(db);
      if (r.bookingsAnonymized || r.messagesDeleted || r.logsDeleted) {
        log(`[retention] обезличено заявок: ${r.bookingsAnonymized}, удалено сообщений: ${r.messagesDeleted}, удалено записей журнала: ${r.logsDeleted}`);
      }
    } catch (e) { console.error('[retention] ошибка:', e.message); }
  };
  const first = setTimeout(tick, 60 * 1000); const daily = setInterval(tick, 24 * 60 * 60 * 1000);
  if (first.unref) first.unref(); if (daily.unref) daily.unref();
}

module.exports = { ANON_NAME, readConfig, runRetention, startRetentionSchedule };
