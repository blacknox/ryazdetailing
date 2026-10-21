#!/usr/bin/env bash
# deploy/backup-run.sh — запуск backup.sh для таймера/cron: при ошибке шлёт уведомление, при успехе отмечает время в backups/last_ok.
# Цепочка: backup → шифрование → выгрузка → retention (всё внутри backup.sh) → отметка/уведомление.
set -u
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"; mkdir -p "$APP_DIR/backups"
LOG="$APP_DIR/backups/last_run.log"
if "$APP_DIR/deploy/backup.sh" >"$LOG" 2>&1; then
  date -Is > "$APP_DIR/backups/last_ok"; logger -t ryazdetailing "backup OK"; exit 0
fi
TAIL="$(tail -n 6 "$LOG" | tr '\n' ' ' | cut -c1-600)"
"$APP_DIR/deploy/notify.sh" "ОШИБКА резервного копирования: $TAIL"
exit 1
