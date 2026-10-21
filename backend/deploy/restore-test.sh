#!/usr/bin/env bash
# Проверка, что резервную копию можно восстановить. Живую базу НЕ трогает:
# всё делается во временной папке, которая удаляется в конце.
#
# Использование:
#   deploy/restore-test.sh                      # последняя локальная копия
#   deploy/restore-test.sh путь/к/файлу.db.gz   # конкретный файл (.db.gz или .db.gz.gpg)
#   deploy/restore-test.sh --remote             # свежая копия из удалённого хранилища
#
# Рекомендуем запускать раз в месяц и после изменений в схеме БД.
set -euo pipefail
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$APP_DIR/backups"
ENV_FILE="${BACKUP_ENV:-$APP_DIR/deploy/backup.env}"
if [ -f "$ENV_FILE" ]; then set -a; . "$ENV_FILE"; set +a; fi

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
SRC=""; STAMP=""

if [ "${1:-}" = "--remote" ]; then
  [ -n "${OFFSITE_REMOTE:-}" ] || { echo "OFFSITE_REMOTE не задан"; exit 2; }
  NAME="$(rclone lsf "$OFFSITE_REMOTE" --include 'ryazdetailing_*' | sort | tail -n 1)"
  [ -n "$NAME" ] || { echo "В $OFFSITE_REMOTE нет копий базы"; exit 2; }
  echo "Скачиваю последнюю копию из хранилища: $NAME"
  rclone copyto "$OFFSITE_REMOTE/$NAME" "$TMP/$NAME"
  SRC="$TMP/$NAME"
  UP_NAME="$(echo "$NAME" | sed 's/^ryazdetailing_/uploads_/; s/\.db\.gz/.tar.gz/')"
  if rclone lsf "$OFFSITE_REMOTE" --include "$UP_NAME" | grep -q .; then
    rclone copyto "$OFFSITE_REMOTE/$UP_NAME" "$TMP/$UP_NAME"; UP_SRC="$TMP/$UP_NAME"
  else UP_SRC=""; fi
elif [ -n "${1:-}" ]; then
  SRC="$1"; [ -f "$SRC" ] || { echo "Файл не найден: $SRC"; exit 2; }
  UP_SRC="$(dirname "$SRC")/$(basename "$SRC" | sed 's/^ryazdetailing_/uploads_/; s/\.db\.gz/.tar.gz/')"
  [ -f "$UP_SRC" ] || UP_SRC=""
else
  SRC="$(ls -1t "$OUT"/ryazdetailing_*.db.gz 2>/dev/null | head -n 1 || true)"
  [ -n "$SRC" ] || { echo "Локальных копий нет в $OUT"; exit 2; }
  UP_SRC="$(echo "$SRC" | sed 's#/ryazdetailing_#/uploads_#; s#\.db\.gz$#.tar.gz#')"
  [ -f "$UP_SRC" ] || UP_SRC=""
fi
echo "Проверяю: $(basename "$SRC")"

# 1. Расшифровать (если файл .gpg)
FILE="$SRC"
case "$SRC" in
  *.gpg)
    [ -n "${BACKUP_PASSPHRASE_FILE:-}" ] && [ -s "$BACKUP_PASSPHRASE_FILE" ] || { echo "Нужен BACKUP_PASSPHRASE_FILE для расшифровки"; exit 2; }
    gpg --batch --yes --quiet --pinentry-mode loopback --passphrase-file "$BACKUP_PASSPHRASE_FILE" -o "$TMP/db.gz" -d "$SRC"
    FILE="$TMP/db.gz"; echo "✓ расшифровано";;
esac

# 2. Распаковать и проверить целостность
gunzip -c "$FILE" > "$TMP/restored.db"
echo "✓ распаковано ($(du -h "$TMP/restored.db" | cut -f1))"
RES="$(sqlite3 "$TMP/restored.db" 'PRAGMA integrity_check;')"
[ "$RES" = "ok" ] || { echo "✗ integrity_check: $RES"; exit 1; }
echo "✓ целостность БД: ok"

# 3. Ключевые таблицы на месте и не пустые там, где должны быть
FAIL=0
for t in admins bookings services settings; do
  if ! sqlite3 "$TMP/restored.db" "SELECT 1 FROM sqlite_master WHERE type='table' AND name='$t';" | grep -q 1; then
    echo "✗ нет таблицы $t"; FAIL=1; continue
  fi
  n="$(sqlite3 "$TMP/restored.db" "SELECT COUNT(*) FROM $t;")"
  echo "  $t: $n"
  case "$t" in admins|services|settings) [ "$n" -gt 0 ] || { echo "✗ таблица $t пуста"; FAIL=1; };; esac
done
for t in reviews messages works blacklist logs; do
  n="$(sqlite3 "$TMP/restored.db" "SELECT COUNT(*) FROM $t;" 2>/dev/null || echo '-')"; echo "  $t: $n"
done
[ "$FAIL" = 0 ] || { echo "✗ структура копии неполная"; exit 1; }

# 4. Архив с фото
if [ -n "${UP_SRC:-}" ]; then
  UF="$UP_SRC"
  case "$UP_SRC" in *.gpg)
    gpg --batch --yes --quiet --pinentry-mode loopback --passphrase-file "$BACKUP_PASSPHRASE_FILE" -o "$TMP/up.tgz" -d "$UP_SRC"; UF="$TMP/up.tgz";;
  esac
  tar -tzf "$UF" >/dev/null && echo "✓ архив uploads читается ($(tar -tzf "$UF" | grep -vc '/$') файлов)"
else
  echo "  (архива uploads рядом нет — пропускаю)"
fi
echo "ГОТОВО: копия пригодна для восстановления."
