#!/usr/bin/env bash
# Ежедневный бэкап SQLite + загруженных фото (uploads/: отзывы, услуги, работы).
# Хранение «дед-отец-сын»: ежедневные за KEEP_DAILY дней (14), еженедельные за KEEP_WEEKLY недель (8),
# ежемесячные за KEEP_MONTHLY месяцев (12) — и на сервере, и в удалённом хранилище.
# Если настроено, выгружает ЗАШИФРОВАННЫЕ копии в удалённое хранилище.
# Cron (crontab -e):  0 4 * * * /home/USER/ryazdetailing-backend/deploy/backup.sh
# Настройки offsite: deploy/backup.env (пример — backup.env.example).
set -euo pipefail
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DB="$APP_DIR/data/ryazdetailing.db"
OUT="$APP_DIR/backups"
ENV_FILE="${BACKUP_ENV:-$APP_DIR/deploy/backup.env}"
if [ -f "$ENV_FILE" ]; then set -a; . "$ENV_FILE"; set +a; fi

# ── Политика хранения ────────────────────────────────────────────────
# OFFSITE_KEEP_DAYS — старое имя настройки, понимаем его как KEEP_DAILY.
KEEP_DAILY="${KEEP_DAILY:-${OFFSITE_KEEP_DAYS:-14}}"
KEEP_WEEKLY="${KEEP_WEEKLY:-8}"
KEEP_MONTHLY="${KEEP_MONTHLY:-12}"
for v in KEEP_DAILY KEEP_WEEKLY KEEP_MONTHLY; do
  case "${!v}" in ''|*[!0-9]*) echo "[backup] ОШИБКА: $v должен быть числом"; exit 1;; esac
done
[ "$KEEP_DAILY" -ge 7 ] || { echo "[backup] ОШИБКА: KEEP_DAILY меньше 7 — отказ (защита от случайного удаления)"; exit 1; }

# BEGIN gfs
# gfs_delete_list — читает со stdin имена копий (в имени есть дата YYYY-MM-DD), печатает те, что
# пора УДАЛИТЬ. Оставляет: по одной (самой свежей) копии на каждый из последних KEEP_DAILY дней,
# на каждую из последних KEEP_WEEKLY недель (ISO) и на каждый из последних KEEP_MONTHLY месяцев.
# Самая свежая копия не удаляется никогда; имена без распознаваемой даты не трогаются.
# NOW_DATE (YYYY-MM-DD) можно задать для тестов.
gfs_delete_list() {
  local kd="${KEEP_DAILY:-14}" kw="${KEEP_WEEKLY:-8}" km="${KEEP_MONTHLY:-12}"
  local today="${NOW_DATE:-$(date +%Y-%m-%d)}"
  local today_s; today_s=$(date -d "$today" +%s)
  local cy=$((10#${today:0:4})) cm=$((10#${today:5:2}))
  local -A seen_day seen_week seen_month
  local name d ds age_days dy dm midx wk keep first=1
  while IFS= read -r name; do
    [ -n "$name" ] || continue
    d=$(printf '%s' "$name" | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}' | head -1) || true
    [ -n "$d" ] || continue
    ds=$(date -d "$d" +%s 2>/dev/null) || continue
    age_days=$(( (today_s - ds) / 86400 ))
    dy=$((10#${d:0:4})); dm=$((10#${d:5:2}))
    midx=$(( (cy * 12 + cm) - (dy * 12 + dm) ))
    wk=$(date -d "$d" +%G-W%V)
    keep=0
    if [ "$first" = 1 ]; then keep=1; first=0; fi
    if [ "$age_days" -lt "$kd" ] && [ -z "${seen_day[$d]:-}" ]; then seen_day[$d]=1; keep=1; fi
    if [ "$age_days" -lt $((kw * 7)) ] && [ -z "${seen_week[$wk]:-}" ]; then seen_week[$wk]=1; keep=1; fi
    if [ "$midx" -lt "$km" ] && [ -z "${seen_month[$dy-$dm]:-}" ]; then seen_month["$dy-$dm"]=1; keep=1; fi
    [ "$keep" = 1 ] || printf '%s\n' "$name"
  done < <(sort -r)   # сначала самые свежие: «первая увиденная» копия периода — самая новая в нём
}
# END gfs

prune_local() { # $1 — маска имён, например 'ryazdetailing_*.db.gz'
  local f
  while IFS= read -r f; do
    if [ "${BACKUP_PRUNE_DRYRUN:-0}" = 1 ]; then echo "[backup] (пробный запуск) удалил бы: $f"; else rm -- "$OUT/$f"; fi
  done < <( (cd "$OUT" && ls -1 $1 2>/dev/null) | gfs_delete_list )
}

mkdir -p "$OUT"
STAMP="$(date +%Y-%m-%d_%H%M)"
DB_FILE="ryazdetailing_$STAMP.db.gz"
UP_FILE="uploads_$STAMP.tar.gz"

ping_health() { # $1 — суффикс ("" или "/fail")
  [ -n "${HEALTHCHECK_URL:-}" ] || return 0
  curl -fsS -m 10 --retry 2 -o /dev/null "${HEALTHCHECK_URL%/}$1" || true
}

# ── 1. Локальная копия ───────────────────────────────────────────────
# .backup безопасен при работающем сервере (в отличие от простого cp)
rm -f "$OUT/ryazdetailing_$STAMP.db"
sqlite3 "$DB" ".backup '$OUT/ryazdetailing_$STAMP.db'"
gzip -f "$OUT/ryazdetailing_$STAMP.db"   # -f: повторный запуск в ту же минуту не должен падать
# Фото отзывов лежат отдельно от БД — без них после восстановления отзывы
# остались бы без картинок.
HAVE_UPLOADS=0
if [ -d "$APP_DIR/uploads" ]; then
  tar -czf "$OUT/$UP_FILE" -C "$APP_DIR" uploads
  HAVE_UPLOADS=1
fi
prune_local 'ryazdetailing_*.db.gz'
prune_local 'uploads_*.tar.gz'
echo "[backup] локальная копия готова: $DB_FILE"

# ── 2. Offsite: зашифровать и выгрузить ──────────────────────────────
offsite_upload() {
  command -v rclone >/dev/null || { echo "[backup] ОШИБКА: rclone не установлен"; return 1; }
  local stage; stage="$(mktemp -d "$OUT/.offsite.XXXXXX")"
  trap 'rm -rf "$stage"' RETURN

  local files=("$DB_FILE"); [ "$HAVE_UPLOADS" = 1 ] && files+=("$UP_FILE")
  local f
  if [ "${ALLOW_UNENCRYPTED_OFFSITE:-0}" = 1 ]; then
    echo "[backup] ВНИМАНИЕ: выгрузка БЕЗ шифрования (ALLOW_UNENCRYPTED_OFFSITE=1)"
    for f in "${files[@]}"; do cp "$OUT/$f" "$stage/$f" || return 1; done
  else
    [ -n "${BACKUP_PASSPHRASE_FILE:-}" ] && [ -s "$BACKUP_PASSPHRASE_FILE" ] || {
      echo "[backup] ОШИБКА: не задан или пуст BACKUP_PASSPHRASE_FILE — в копиях персональные данные, без шифрования наружу не выгружаем"; return 1; }
    command -v gpg >/dev/null || { echo "[backup] ОШИБКА: gpg не установлен"; return 1; }
    for f in "${files[@]}"; do
      gpg --batch --yes --quiet --pinentry-mode loopback --passphrase-file "$BACKUP_PASSPHRASE_FILE" \
          --symmetric --cipher-algo AES256 -o "$stage/$f.gpg" "$OUT/$f" || return 1
    done
  fi

  rclone copy "$stage" "$OFFSITE_REMOTE" --immutable --retries 3 --low-level-retries 5 || return 1
  # Убеждаемся, что файлы реально лежат на той стороне и совпадают
  rclone check "$stage" "$OFFSITE_REMOTE" --one-way >/dev/null 2>&1 || { echo "[backup] ОШИБКА: проверка выгруженных файлов не прошла"; return 1; }

  # Чистим по той же политике (дед-отец-сын) — только наши файлы. Если список удалённых
  # файлов получить не удалось, НИЧЕГО не удаляем (лучше лишняя копия, чем потерянная).
  local prefix list victim n_total n_del
  for prefix in ryazdetailing uploads; do
    list="$(rclone lsf "$OFFSITE_REMOTE" --files-only --include "${prefix}_*" 2>/dev/null)" || { echo "[backup] предупреждение: не удалось получить список в хранилище — очистка пропущена"; break; }
    [ -n "$list" ] || continue
    n_total=$(printf '%s\n' "$list" | wc -l)
    victims="$(printf '%s\n' "$list" | gfs_delete_list)"
    n_del=$(printf '%s' "$victims" | grep -c . || true)
    [ "$n_del" -lt "$n_total" ] || { echo "[backup] ОШИБКА: очистка удалила бы ВСЕ копии ${prefix} — отмена"; return 1; }
    while IFS= read -r victim; do
      [ -n "$victim" ] || continue
      if [ "${BACKUP_PRUNE_DRYRUN:-0}" = 1 ]; then echo "[backup] (пробный запуск) удалил бы в хранилище: $victim"
      else rclone deletefile "$OFFSITE_REMOTE/$victim" || return 1; fi
    done <<< "$victims"
  done
  echo "[backup] выгружено в $OFFSITE_REMOTE (хранение: ${KEEP_DAILY} дн. / ${KEEP_WEEKLY} нед. / ${KEEP_MONTHLY} мес.)"
}

if [ -z "${OFFSITE_REMOTE:-}" ]; then
  echo "[backup] offsite не настроен (OFFSITE_REMOTE пуст) — копии только на этом сервере"
  exit 0
fi

if offsite_upload; then
  echo "$(date -Is) OK $DB_FILE" > "$OUT/offsite_status.txt"
  ping_health ""
else
  echo "$(date -Is) FAIL $DB_FILE" > "$OUT/offsite_status.txt"
  ping_health "/fail"
  exit 1
fi
