#!/usr/bin/env bash
# deploy/install-logrotate.sh — установить ротацию логов (nginx + приложение). Запускать через sudo.
#   sudo bash deploy/install-logrotate.sh [пользователь-приложения]
set -euo pipefail
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"; RUN_USER="${1:-${SUDO_USER:-$(id -un)}}"
[ "$(id -u)" = 0 ] || { echo "Запустите через sudo"; exit 1; }
id "$RUN_USER" >/dev/null 2>&1 || { echo "Нет пользователя $RUN_USER"; exit 1; }
mkdir -p "$APP_DIR/logs"; chown "$RUN_USER":"$RUN_USER" "$APP_DIR/logs"; chmod 750 "$APP_DIR/logs"
sed -e "s#__APP_DIR__#$APP_DIR#g" -e "s#__USER__#$RUN_USER#g" "$APP_DIR/deploy/logrotate-ryazdetailing" > /etc/logrotate.d/ryazdetailing
chmod 644 /etc/logrotate.d/ryazdetailing
echo "== проверка конфигурации (dry-run) =="; logrotate -d /etc/logrotate.d/ryazdetailing 2>&1 | grep -E "error|rotating pattern|considering log" | head -12
echo; echo "Готово. Принудительная ротация для проверки:  sudo logrotate -f /etc/logrotate.d/ryazdetailing && ls -la $APP_DIR/logs /var/log/nginx"
echo "Не забудьте перезапустить pm2 с обновлённым ecosystem: pm2 reload deploy/ecosystem.config.js && pm2 save"
