#!/usr/bin/env bash
# deploy/install-backup-timer.sh — установить systemd-таймеры резервного копирования (запускать через sudo).
#   sudo bash deploy/install-backup-timer.sh [пользователь-владелец-приложения]
set -euo pipefail
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"; RUN_USER="${1:-${SUDO_USER:-$(id -un)}}"
[ "$(id -u)" = 0 ] || { echo "Запустите через sudo"; exit 1; }
id "$RUN_USER" >/dev/null 2>&1 || { echo "Нет пользователя $RUN_USER"; exit 1; }
for u in ryazdetailing-backup ryazdetailing-backup-watchdog; do
  for k in service timer; do
    sed -e "s#__APP_DIR__#$APP_DIR#g" -e "s#__USER__#$RUN_USER#g" "$APP_DIR/deploy/systemd/$u.$k" > "/etc/systemd/system/$u.$k"
  done
done
systemctl daemon-reload
systemctl enable --now ryazdetailing-backup.timer ryazdetailing-backup-watchdog.timer
systemctl list-timers 'ryazdetailing-*' --no-pager
echo; echo "Готово. Проверка: sudo systemctl start ryazdetailing-backup.service && journalctl -u ryazdetailing-backup -n 30 --no-pager"
echo "Не забудьте: deploy/backup.env (OFFSITE_REMOTE, BACKUP_PASSPHRASE_FILE) и канал уведомлений (TELEGRAM_* в .env или NOTIFY_WEBHOOK_URL / NOTIFY_EMAIL в backup.env)."
