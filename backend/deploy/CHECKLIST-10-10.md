# Чек-лист выхода на 10/10: что выполнить на боевом сервере

Порядок важен: каждый шаг опирается на предыдущий. После каждого шага отметьте результат и **пришлите мне вывод**, разберу.
Всё, что можно было проверить без сервера, уже проверено (тесты, тестовый nginx, тест ротации логов, цепочка backup → уведомление).

## 0. Подготовка
1. VPS (Ubuntu 22.04/24.04), домен, A/AAAA-записи на сервер (`ryazdetailing.ru` и `www`).
2. Установить: nginx, certbot, Node 20+, pm2, `sqlite3`, `gnupg`, `rclone`, `logrotate`.
3. Развернуть бэкенд и сайт по `deploy/DEPLOY.md`; `.env` по `.env.example` (сильные пароли ≥12 символов, `NODE_ENV=production`, `SITE_DIR`, `SITE_URL=https://ryazdetailing.ru`).
   Сервер сам откажется стартовать со слабым паролем или без `SITE_DIR`.
4. Сайт раздавайте из `dist/` (`npm run build` в папке сайта) — он минифицирован.

## 1–2, 8. HTTPS, сертификат, IPv6 (пункты аудита: Production SSL, redirect, IPv6)
```
sudo certbot --nginx -d ryazdetailing.ru -d www.ryazdetailing.ru        # или вариант из DEPLOY.md с готовым конфигом
sudo nginx -t && sudo systemctl reload nginx
CERTBOT_CHECK=1 ADMIN_LOGIN=… ADMIN_PASSWORD=… sudo -E bash deploy/check-production.sh ryazdetailing.ru
```
**Критерий: `0 FAIL`.** Скрипт содержит 44 проверки (больше, чем «35» в аудите): HTTPS-редиректы, HSTS и заголовки, cookie, gzip/кеш, закрытые пути,
SEO-файлы, **сертификат (цепочка, срок ≥14 дней, www)**, TLS 1.2/1.3 и отказ TLS 1.0/1.1, HTTP/2, **IPv6 (если есть AAAA)**, смешанное содержимое и `certbot renew --dry-run`.
Если у домена есть AAAA-запись, а сайт по IPv6 не отвечает — либо добавьте `listen [::]:443`, либо уберите AAAA. Строки `listen [::]` в конфиге уже есть.

## 3–4. Offsite-backup и автоматическая цепочка
```
cp deploy/backup.env.example deploy/backup.env      # OFFSITE_REMOTE=s3remote:bucket/ryazdetailing  BACKUP_PASSPHRASE_FILE=/root/.rd_backup_pass
rclone config                                       # создать remote для S3-совместимого хранилища
sudo bash deploy/install-backup-timer.sh            # таймер 04:00 + сторож 09:00
sudo systemctl start ryazdetailing-backup.service && journalctl -u ryazdetailing-backup -n 30 --no-pager
bash deploy/restore-test.sh --remote                # восстановление ИМЕННО из облачной копии
```
Парольную фразу шифрования храните **отдельно от сервера** (менеджер паролей): без неё копии не расшифровать.
Канал уведомлений: `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` в `.env` или `NOTIFY_WEBHOOK_URL`/`NOTIFY_EMAIL` в `backup.env`
(Telegram с российских серверов бывает недоступен — тогда веб-хук или e-mail). Проверка канала: `bash deploy/notify.sh "тест"`.
**Критерий:** в облаке появились `.gpg`-файлы после ночного запуска; `restore-test --remote` = «ГОТОВО»; тестовая ошибка (неверный путь к парольной фразе) приходит уведомлением.

## 5. Logrotate
```
sudo bash deploy/install-logrotate.sh && pm2 reload deploy/ecosystem.config.js && pm2 save
sudo logrotate -f /etc/logrotate.d/ryazdetailing && ls -la logs /var/log/nginx
```
**Критерий:** появились архивы `*.1`/`*.gz`, рабочие логи продолжают писаться, права каталога `logs/` — `750`.

## 6. Внешний security-скан (DAST)
Самописный набор атак (`tests/dast.js`, 48 проверок: SQLi, подделка JWT, path traversal, CSRF/CORS, mass assignment и др.) уже проходит, но **не заменяет внешний сканер**.
```
docker run --rm -v $(pwd):/zap/wrk -t ghcr.io/zaproxy/zaproxy:stable zap-baseline.py -t https://ryazdetailing.ru -r zap-baseline.html
# глубже (активные атаки) — лучше на копии сайта, а не на боевой БД:
docker run --rm -v $(pwd):/zap/wrk -t ghcr.io/zaproxy/zaproxy:stable zap-full-scan.py -t https://ryazdetailing.ru -r zap-full.html
```
Осторожно: активный скан создаёт тестовые заявки/сообщения/отзывы и может на время заблокировать ваш IP лимитом входа; после него удалите тестовые записи.
**Критерий:** нет High/Critical; Medium — разобрать и задокументировать.

## 7. Core Web Vitals на живом сайте
```
cd site && npm install && LH_FORMS=mobile,desktop LH_PAGES=/index.html,/services.html,/service-wash.html,/booking.html,/contacts.html E2E_SPEC=lighthouse.js npm run e2e
```
(для живого URL запускайте Lighthouse напрямую: `npx lighthouse https://ryazdetailing.ru --preset=desktop`, затем без preset для мобильного)
Плюс PageSpeed Insights и Search Console → «Основные интернет-показатели» (реальные данные появляются через ~28 дней трафика).
**Критерий:** LCP ≤ 2,5 с, CLS ≤ 0,1, INP ≤ 200 мс, TTFB ≤ 0,8 с на мобильном.

## 9. Финальная регрессия (в репозитории, после деплоя-версии)
```
cd backend && npm run test:all          # unit 27 + integration/RBAC/DAST/логи/security
cd ../site && npm test && BACKEND_DIR=../backend npm run e2e && E2E_SPEC=keyboard.js BACKEND_DIR=../backend npm run e2e && E2E_SPEC=a11y.js BACKEND_DIR=../backend npm run e2e
```

## Итоговая таблица (из аудита)
| Пункт | Как закрыть | Статус |
|---|---|---|
| Production check | `check-production.sh` → 0 FAIL | ☐ |
| Production SSL/HTTPS, redirect | certbot + шаг 1–2 | ☐ |
| IPv6 | шаг 1–2 | ☐ |
| Offsite cloud backup, restore из него | шаг 3–4 | ☐ |
| Автоматический backup, retention, уведомления | таймер + сторож | ☐ |
| Logrotate | шаг 5 | ☐ |
| Внешний DAST | шаг 6 | ☐ |
| Core Web Vitals | шаг 7 | ☐ |
| Финальная регрессия, Lighthouse/axe | шаг 9 | ☐ |
| Нет P0/P1 | по итогам шагов 1–7 | ☐ |
