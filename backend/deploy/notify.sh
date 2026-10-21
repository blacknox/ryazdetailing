#!/usr/bin/env bash
# deploy/notify.sh "текст" — отправить уведомление об ошибке по всем настроенным каналам:
#   • syslog (всегда): journalctl -t ryazdetailing
#   • Telegram: TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID (берутся из .env приложения)
#   • веб-хук (Slack/Mattermost/любой JSON-приёмник): NOTIFY_WEBHOOK_URL в deploy/backup.env
#   • e-mail: NOTIFY_EMAIL в deploy/backup.env (нужна команда mail/mailx)
# Код возврата 0, если дошло хотя бы по одному ВНЕШНЕМУ каналу; иначе 1 (ошибка видна только в syslog).
# Telegram с российских VPS часто недоступен — поэтому есть веб-хук и e-mail.
set -u
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
MSG="${1:-без текста}"; HOST="$(hostname)"; TEXT="[РязДетейлинг · $HOST] $MSG"
for f in "$APP_DIR/.env" "${BACKUP_ENV:-$APP_DIR/deploy/backup.env}"; do [ -f "$f" ] && { set -a; . "$f" 2>/dev/null; set +a; }; done
logger -t ryazdetailing -p user.err -- "$TEXT" 2>/dev/null || true
sent=0
if [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_CHAT_ID:-}" ]; then
  curl -fsS -m 10 "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" --data-urlencode "chat_id=${TELEGRAM_CHAT_ID}" --data-urlencode "text=$TEXT" >/dev/null 2>&1 && sent=1 || echo "notify: Telegram недоступен" >&2
fi
if [ -n "${NOTIFY_WEBHOOK_URL:-}" ]; then
  J=$(python3 -c 'import json,sys; print(json.dumps({"text": sys.argv[1]}, ensure_ascii=False))' "$TEXT" 2>/dev/null || printf '{"text":"%s"}' "backup alert")
  curl -fsS -m 10 -X POST -H "Content-Type: application/json; charset=utf-8" --data-binary "$J" "$NOTIFY_WEBHOOK_URL" >/dev/null 2>&1 && sent=1 || echo "notify: веб-хук недоступен" >&2
fi
if [ -n "${NOTIFY_EMAIL:-}" ]; then
  MAILER="$(command -v mail || command -v mailx || true)"
  [ -n "$MAILER" ] && printf '%s\n' "$TEXT" | "$MAILER" -s "РязДетейлинг: проблема на сервере" "$NOTIFY_EMAIL" && sent=1 || echo "notify: e-mail не отправлен (нет mail/mailx?)" >&2
fi
[ "$sent" = 1 ] || echo "notify: ни один внешний канал не настроен или не ответил — сообщение только в syslog" >&2
[ "$sent" = 1 ]
