#!/usr/bin/env bash
# Проверка политики хранения бэкапов без запуска самого бэкапа: берёт функцию gfs_delete_list
# из backup.sh и гоняет её на искусственных 400 днях копий.  Запуск:  bash deploy/test-retention.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
eval "$(sed -n '/^# BEGIN gfs$/,/^# END gfs$/p' "$HERE/backup.sh")"
export NOW_DATE=2026-10-14 KEEP_DAILY=14 KEEP_WEEKLY=8 KEEP_MONTHLY=12
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
{ for i in $(seq 0 399); do d=$(date -d "$NOW_DATE - $i days" +%Y-%m-%d); echo "ryazdetailing_${d}_0400.db.gz"; echo "ryazdetailing_${d}_1600.db.gz"; done; echo "notes.txt"; } > "$T/all"
sort -r "$T/all" | gfs_delete_list > "$T/del"
comm -23 <(sort "$T/all") <(sort "$T/del") > "$T/kept"
fail=0; check() { if eval "$2"; then echo "PASS $1"; else echo "FAIL $1"; fail=1; fi; }
check "самая свежая копия сохранена"           "grep -q '2026-10-14_1600' '$T/kept'"
check "дубль в тот же день удалён"             "grep -q '2026-10-14_0400' '$T/del'"
check "последние 14 дней — по копии на день"   "[ \$(grep -cE '2026-10-(0[1-9]|1[0-4])_1600' '$T/kept') -eq 14 ]"
check "месячные: 12 месяцев назад есть"        "grep -q '2025-11-30_1600' '$T/kept'"
check "старше 12 месяцев — удалено"            "! grep -qE '2025-10-' '$T/kept'"
check "файл без даты не тронут"                "! grep -q notes.txt '$T/del'"
check "итого оставлено разумное число (25–40)" "n=\$(grep -vc notes '$T/kept'); [ \$n -ge 25 ] && [ \$n -le 40 ]"
exit $fail
