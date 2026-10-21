#!/usr/bin/env bash
# deploy/backup-watchdog.sh — сторож: сообщает, если успешной копии не было дольше MAX_AGE_HOURS (по умолчанию 30 ч)
# или offsite-выгрузка последней копии завершилась ошибкой. Ловит случай «таймер не сработал / сервер был выключен».
set -u
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"; MAX_H="${MAX_AGE_HOURS:-30}"
F="$APP_DIR/backups/last_ok"; ST="$APP_DIR/backups/offsite_status.txt"
if [ ! -f "$F" ]; then "$APP_DIR/deploy/notify.sh" "Резервных копий ещё не было (нет backups/last_ok) — проверьте таймер ryazdetailing-backup"; exit 1; fi
AGE=$(( ( $(date +%s) - $(date -r "$F" +%s) ) / 3600 ))
if [ "$AGE" -gt "$MAX_H" ]; then "$APP_DIR/deploy/notify.sh" "Последняя успешная копия была $AGE ч назад (порог $MAX_H ч). Проверьте: systemctl status ryazdetailing-backup.timer"; exit 1; fi
if [ -f "$ST" ] && tail -n 1 "$ST" | grep -q " FAIL "; then "$APP_DIR/deploy/notify.sh" "Выгрузка последней копии во внешнее хранилище завершилась ошибкой: $(tail -n 1 "$ST")"; exit 1; fi
echo "OK: последняя копия $AGE ч назад"
