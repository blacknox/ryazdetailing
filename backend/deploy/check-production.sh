#!/usr/bin/env bash
# deploy/check-production.sh — проверка боевого сайта снаружи: HTTPS, заголовки безопасности, кеш, сжатие,
# закрытые пути, SEO-файлы, cookie. Запуск после деплоя:
#   bash deploy/check-production.sh ryazdetailing.ru
# Необязательно: ADMIN_LOGIN / ADMIN_PASSWORD — проверит ещё и cookie входа (флаги HttpOnly, Secure, SameSite).
# Тестовый стенд: CURL_OPTS="-k --resolve ryazdetailing.ru:443:127.0.0.1" TLS_CONNECT=127.0.0.1:443 SKIP_CHAIN=1
# На сервере доп. проверка автопродления сертификата: CERTBOT_CHECK=1 sudo -E bash deploy/check-production.sh ryazdetailing.ru
set -u
DOMAIN="${1:-}"; [ -z "$DOMAIN" ] && { echo "Использование: $0 домен (например ryazdetailing.ru)"; exit 2; }
OPTS="${CURL_OPTS:-}"
pass=0; fail=0
ok()  { pass=$((pass+1)); echo "PASS $1"; }
bad() { fail=$((fail+1)); echo "FAIL $1${2:+  → $2}"; }
hdr() { curl -s $OPTS -D - -o /dev/null "$@" | tr -d '\r'; }      # только заголовки
code() { curl -s $OPTS -o /dev/null -w "%{http_code}" "$@"; }

# Если сайт не отвечает, проверки «путь закрыт» и «заголовка нет» были бы ложно зелёными — останавливаемся сразу.
C0=$(code "https://$DOMAIN/")
if [ "$C0" = "000" ]; then echo "FAIL сайт https://$DOMAIN/ недоступен (нет ответа, код 000): проверьте DNS, сертификат, nginx"; echo; echo "Итог: 0 PASS, 1 FAIL"; exit 1; fi

R=$(curl -s $OPTS -o /dev/null -w "%{http_code} %{redirect_url}" "http://$DOMAIN/prices.html")
case "$R" in "301 https://$DOMAIN/prices.html"*) ok "HTTP → HTTPS (301)";; *) bad "HTTP → HTTPS (301)" "$R";; esac
R=$(curl -s $OPTS -o /dev/null -w "%{http_code} %{redirect_url}" "https://www.$DOMAIN/")
case "$R" in "301 https://$DOMAIN/"*) ok "www → без www (301)";; *) bad "www → без www (301)" "$R";; esac

H=$(hdr "https://$DOMAIN/")
echo "$H" | head -1 | grep -q " 200" && ok "главная отвечает 200 по HTTPS" || bad "главная отвечает 200 по HTTPS" "$(echo "$H" | head -1)"
for h in strict-transport-security content-security-policy x-content-type-options x-frame-options referrer-policy permissions-policy; do
  echo "$H" | grep -qi "^$h:" && ok "заголовок $h" || bad "заголовок $h" "отсутствует"
done
echo "$H" | grep -qi "^strict-transport-security:.*max-age=[0-9]\{7,\}" && ok "HSTS ≥ 1 года" || bad "HSTS ≥ 1 года"
echo "$H" | grep -qi "^content-security-policy:.*'unsafe-eval'" && bad "CSP без unsafe-eval" "найден unsafe-eval" || ok "CSP без unsafe-eval"
echo "$H" | grep -qi "^server:.*[0-9]\+\.[0-9]\+" && bad "версия nginx не раскрывается (server_tokens off)" "$(echo "$H" | grep -i '^server:')" || ok "версия nginx не раскрывается"
echo "$H" | grep -qi "^cache-control:.*no-cache" && ok "HTML: Cache-Control no-cache (свежесть после выкладки)" || bad "HTML: Cache-Control no-cache" "$(echo "$H" | grep -i '^cache-control')"

H=$(hdr -H "Accept-Encoding: gzip" "https://$DOMAIN/style.css")
echo "$H" | grep -qi "^content-encoding: *\(gzip\|br\)" && ok "сжатие CSS (gzip/brotli)" || bad "сжатие CSS (gzip/brotli)"
H=$(hdr "https://$DOMAIN/assets/hero-car.avif")
N=$(echo "$H" | grep -ci "^cache-control:")
{ echo "$H" | grep -qi "^cache-control:.*max-age=[0-9]\{6,\}" && [ "$N" = "1" ]; } && ok "картинки: один Cache-Control с max-age ≥ 11 дней" || bad "картинки: один Cache-Control с max-age" "заголовков: $N"

[ "$(code "https://$DOMAIN/api/services")" = "200" ] && ok "API через прокси: /api/services 200" || bad "API через прокси: /api/services 200"
[ "$(code "https://$DOMAIN/health")" = "200" ] && ok "health-эндпоинт 200" || bad "health-эндпоинт 200"
for p in /.env /.git/config /data/ryazdetailing.db /node_modules/ /package.json /server.js /deploy/backup.sh /backups/ /uploads/../data/ryazdetailing.db; do
  c=$(code "https://$DOMAIN$p"); case "$c" in 200) bad "закрыт путь $p" "ОТДАЁТСЯ (200)";; 000) bad "закрыт путь $p" "нет ответа";; *) ok "закрыт путь $p ($c)";; esac
done
[ "$(code "https://$DOMAIN/robots.txt")" = "200" ] && ok "robots.txt" || bad "robots.txt"
[ "$(code "https://$DOMAIN/sitemap.xml")" = "200" ] && ok "sitemap.xml" || bad "sitemap.xml"
[ "$(code "https://$DOMAIN/favicon.ico")" = "200" ] && ok "favicon.ico" || bad "favicon.ico"
[ "$(code "https://$DOMAIN/net-takoy-stranitsy-123")" = "404" ] && ok "несуществующая страница → 404" || bad "несуществующая страница → 404"
curl -s $OPTS "https://$DOMAIN/robots.txt" | grep -q "Disallow: /api/" && ok "robots: /api/ закрыт" || bad "robots: /api/ закрыт"

if [ -n "${ADMIN_LOGIN:-}" ] && [ -n "${ADMIN_PASSWORD:-}" ]; then
  C=$(curl -s $OPTS -D - -o /tmp/.rd_login_body -X POST -H "Content-Type: application/json" -H "X-Requested-With: rd-admin" \
       -d "{\"login\":\"$ADMIN_LOGIN\",\"password\":\"$ADMIN_PASSWORD\"}" "https://$DOMAIN/api/auth/login" | tr -d '\r' | grep -i "^set-cookie:")
  for f in HttpOnly Secure "SameSite=Strict"; do echo "$C" | grep -qi "$f" && ok "cookie сессии: $f" || bad "cookie сессии: $f" "$C"; done
  grep -q "eyJ" /tmp/.rd_login_body && bad "токен не возвращается в теле ответа" || ok "токен не возвращается в теле ответа"; rm -f /tmp/.rd_login_body
else echo "SKIP cookie входа (задайте ADMIN_LOGIN и ADMIN_PASSWORD)"; fi

# ───────────────────────── TLS / сертификат / сетевой стек ─────────────────────────
TLS_HOST="${TLS_CONNECT:-$DOMAIN:443}"          # на тестовом стенде: TLS_CONNECT=127.0.0.1:443
SCLIENT="openssl s_client -connect $TLS_HOST -servername $DOMAIN"
CERT_PEM=$(echo | $SCLIENT 2>/dev/null | sed -n '/BEGIN CERTIFICATE/,/END CERTIFICATE/p' | sed '/END CERTIFICATE/q')
if [ -z "$CERT_PEM" ]; then bad "TLS: сертификат получен" "не удалось подключиться к $TLS_HOST"; else
  ok "TLS: сертификат получен"
  if [ "${SKIP_CHAIN:-0}" = "1" ]; then echo "SKIP цепочка сертификатов (SKIP_CHAIN=1 — тестовый сертификат)"; else
    V=$(echo | $SCLIENT -verify_return_error 2>&1 | grep -E "Verify return code" | head -1)
    case "$V" in *"code: 0 (ok)"*) ok "TLS: цепочка сертификатов доверенная (без -k)";; *) bad "TLS: цепочка сертификатов доверенная" "$V";; esac
  fi
  if echo "$CERT_PEM" | openssl x509 -noout -checkend $((14*86400)) >/dev/null 2>&1; then ok "TLS: сертификат действителен ещё ≥ 14 дней"; else bad "TLS: сертификат действителен ещё ≥ 14 дней" "$(echo "$CERT_PEM" | openssl x509 -noout -enddate)"; fi
  SAN=$(echo "$CERT_PEM" | openssl x509 -noout -ext subjectAltName 2>/dev/null)
  echo "$SAN" | grep -q "DNS:$DOMAIN" && ok "TLS: сертификат покрывает $DOMAIN" || bad "TLS: сертификат покрывает $DOMAIN" "$SAN"
  echo "$SAN" | grep -q "DNS:www.$DOMAIN" && ok "TLS: сертификат покрывает www.$DOMAIN" || bad "TLS: сертификат покрывает www.$DOMAIN" "$SAN"
  KB=$(echo "$CERT_PEM" | openssl x509 -noout -text 2>/dev/null | grep -E "Public-Key:|ASN1 OID|NIST CURVE" | head -2 | tr '\n' ' ')
  echo "INFO ключ: $KB"
fi
for v in "1.2" "1.3"; do
  curl -s $OPTS --tlsv$v --tls-max $v -o /dev/null "https://$DOMAIN/" 2>/dev/null && ok "TLS $v поддерживается" || bad "TLS $v поддерживается"
done
# TLS 1.0/1.1 должны отклоняться. Современный openssl/curl может не уметь даже попытаться — тогда честно «SKIP», а не ложный PASS.
OLD=$(echo | $SCLIENT -tls1_1 -cipher 'DEFAULT:@SECLEVEL=0' 2>&1)
if echo "$OLD" | grep -qi "no protocols available\|unsupported protocol\|unknown option\|Option unknown"; then echo "SKIP TLS 1.0/1.1 отклоняются (локальный openssl не умеет их пробовать — проверьте внешним сканером, напр. ssllabs.com)";
elif echo "$OLD" | grep -E "Cipher is|Cipher +:" | grep -qv "(NONE)\|0000"; then bad "TLS 1.0/1.1 отклоняются" "сервер согласовал шифр на TLS 1.1"; else ok "TLS 1.0/1.1 отклоняются (alert protocol version)"; fi
curl -s $OPTS --http2 -o /dev/null -w "%{http_version}" "https://$DOMAIN/" 2>/dev/null | grep -q "^2" && ok "HTTP/2 включён" || bad "HTTP/2 включён"

# IPv6: если у домена есть AAAA — сайт обязан работать и по IPv6 (иначе часть пользователей получит ошибку).
AAAA=$(getent ahostsv6 "$DOMAIN" 2>/dev/null | awk '{print $1}' | sort -u | head -1)
if [ -n "${IPV6_CHECK:-}" ] || [ -n "$AAAA" ]; then
  if curl -s -6 $OPTS -o /dev/null -w "%{http_code}" "https://$DOMAIN/" 2>/dev/null | grep -q "^200"; then ok "IPv6: https://$DOMAIN/ отвечает 200 по IPv6 ($AAAA)"; else bad "IPv6: https://$DOMAIN/ отвечает по IPv6" "AAAA есть ($AAAA), но сайт по IPv6 недоступен — уберите AAAA-запись или настройте listen [::]:443"; fi
  curl -s -6 $OPTS -o /dev/null -w "%{http_code} %{redirect_url}" "http://$DOMAIN/" 2>/dev/null | grep -q "^301 https://" && ok "IPv6: HTTP → HTTPS редирект" || bad "IPv6: HTTP → HTTPS редирект"
else echo "SKIP IPv6 (у домена нет AAAA-записи; для проверки без DNS: IPV6_CHECK=1) — не блокер"; fi

# Смешанное содержимое: ни одна страница из sitemap не должна подтягивать http:// ресурсы
MIXED=""; N=0
for u in $(curl -s $OPTS "https://$DOMAIN/sitemap.xml" | grep -o "<loc>[^<]*</loc>" | sed 's/<[^>]*>//g' | head -40); do
  N=$((N+1)); B=$(curl -s $OPTS "$u"); H=$(echo "$B" | grep -o -E "(src|href|action|data-src|poster)=\"http://[^\"]+\"|url\(['\"]?http://[^)]+" | grep -v "www.w3.org" | head -2)
  [ -n "$H" ] && MIXED="$MIXED $u: $H"
done
[ "$N" -gt 0 ] || bad "смешанное содержимое: sitemap читается" "страниц: 0"
[ -z "$MIXED" ] && [ "$N" -gt 0 ] && ok "нет смешанного содержимого (http:// ресурсов) на $N страницах из sitemap" || { [ "$N" -gt 0 ] && bad "смешанное содержимое" "$MIXED"; }
if [ "${CERTBOT_CHECK:-0}" = "1" ]; then
  if command -v certbot >/dev/null 2>&1; then certbot renew --dry-run >/tmp/.certbot_dry 2>&1 && ok "certbot: автопродление работает (renew --dry-run)" || bad "certbot: автопродление (renew --dry-run)" "$(tail -3 /tmp/.certbot_dry | tr '\n' ' ')"; systemctl list-timers 2>/dev/null | grep -q certbot && ok "certbot: таймер продления активен" || echo "INFO таймер certbot не найден в systemd (проверьте cron: /etc/cron.d/certbot)"; else bad "certbot установлен" "команда certbot не найдена (запускайте этот блок на сервере)"; fi
else echo "SKIP certbot renew --dry-run (на сервере: CERTBOT_CHECK=1 sudo -E bash deploy/check-production.sh ...)"; fi

echo; echo "Итог: $pass PASS, $fail FAIL"; [ "$fail" = 0 ]
