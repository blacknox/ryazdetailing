// telegram.js — отправка уведомлений о новых заявках в Telegram.

async function notifyTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.warn('[telegram] TELEGRAM_BOT_TOKEN или TELEGRAM_CHAT_ID не заданы — уведомление не отправлено.');
    return { ok: false, reason: 'not_configured' };
  }

  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
      }),
      // Если Telegram недоступен (в РФ он бывает заблокирован), не держим соединение вечно.
      signal: AbortSignal.timeout(8000),
    });
    const data = await res.json();
    if (!data.ok) {
      console.error('[telegram] Ошибка отправки:', data.description);
    }
    return data;
  } catch (err) {
    console.error('[telegram] Не удалось отправить уведомление:', err.message);
    return { ok: false, reason: 'network_error' };
  }
}

function formatBookingMessage(booking) {
  const lines = [
    '🔔 <b>Новая запись</b>',
    `Клиент: ${escapeHtml(booking.name)}`,
    `Телефон: ${escapeHtml(booking.phone)}`,
  ];
  if (booking.service) lines.push(`Услуга: ${escapeHtml(booking.service)}`);
  lines.push(`Дата: ${escapeHtml(booking.date)}`);
  lines.push(`Время: ${escapeHtml(booking.time)}`);
  if (booking.car) lines.push(`Авто: ${escapeHtml(booking.car)}`);
  if (booking.comment) lines.push(`Комментарий: ${escapeHtml(booking.comment)}`);
  return lines.join('\n');
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

module.exports = { notifyTelegram, formatBookingMessage };
