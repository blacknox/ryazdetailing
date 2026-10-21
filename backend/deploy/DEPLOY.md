# Деплой РязДетейлинг на VPS (Ubuntu 22.04/24.04)

Схема: Nginx отдаёт статический сайт и проксирует `/api/` на Node.js (порт 3000, pm2). База — SQLite-файл.

## 0. Что нужно заранее
- VPS с Ubuntu, доступ по SSH (root или sudo-пользователь)
- Домен, направленный A-записью на IP сервера (без домена работать можно только по http://IP — для проверки; вводить пароль админки по http нельзя)

## 1. Подготовка сервера
    sudo apt update && sudo apt upgrade -y
    sudo apt install -y nginx sqlite3 curl ufw
    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
    sudo apt install -y nodejs build-essential python3
    sudo npm install -g pm2
    sudo ufw allow OpenSSH && sudo ufw allow 'Nginx Full' && sudo ufw enable

## 2. Бэкенд
Загрузите папку backend (с вашего компьютера):
    scp -r backend/ USER@IP:/home/USER/ryazdetailing-backend
На сервере:
    cd ~/ryazdetailing-backend
    npm install --omit=dev
    cp .env.example .env && nano .env
В `.env` обязательно: JWT_SECRET (команда генерации в файле), ADMIN_PASSWORD, MANAGER_PASSWORD, FRONTEND_ORIGIN (только если сайт на другом домене, иначе пусто)ЕН, Telegram (см. ниже).
    pm2 start deploy/ecosystem.config.js
    pm2 save && pm2 startup     # выполнить команду, которую покажет pm2
Проверка: `curl http://127.0.0.1:3000/api/health` → `{"ok":true,...}`

## 3. Сайт
    sudo mkdir -p /var/www/ryazdetailing
    # с компьютера: scp -r "Ryazan Retailing"/* USER@IP:/tmp/site/   затем на сервере:
    sudo cp -r /tmp/site/* /var/www/ryazdetailing/
    sudo cp ~/ryazdetailing-backend/deploy/nginx-security-headers.conf /etc/nginx/snippets/ryazdetailing-security.conf
    sudo cp ~/ryazdetailing-backend/deploy/nginx-ryazdetailing.conf /etc/nginx/sites-available/ryazdetailing
    sudo ln -s /etc/nginx/sites-available/ryazdetailing /etc/nginx/sites-enabled/
    sudo rm -f /etc/nginx/sites-enabled/default
    sudo nginx -t && sudo systemctl reload nginx

## 4. HTTPS (после того как домен указывает на сервер)

**Вариант А — проще (certbot сам правит nginx):**

    sudo apt install -y certbot python3-certbot-nginx
    sudo certbot --nginx -d ВАШ_ДОМЕН -d www.ВАШ_ДОМЕН

**Вариант Б — полный контроль** (TLS 1.2+/1.3, редирект www → без www, HTTP рабочую версию не отдаёт, опционально Brotli):

    sudo apt install -y certbot
    sudo mkdir -p /var/www/certbot
    # 1) пока работает только HTTP-конфиг (nginx-ryazdetailing.conf), получите сертификат:
    sudo certbot certonly --webroot -w /var/www/certbot -d ВАШ_ДОМЕН -d www.ВАШ_ДОМЕН
    # 2) подключите финальный конфиг (замените домен и папку сайта внутри файла):
    sudo cp deploy/nginx-ryazdetailing-https.conf /etc/nginx/sites-available/ryazdetailing
    sudo nginx -t && sudo systemctl reload nginx
    # 3) продление: certbot ставит таймер сам; проверьте и перезагружайте nginx после продления
    sudo certbot renew --dry-run
    echo -e '#!/bin/sh\nsystemctl reload nginx' | sudo tee /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh && sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh

После включения HTTPS обязательно проверьте: `http://ВАШ_ДОМЕН` отвечает 301 на `https://…`; вход в админку работает (cookie получает флаг Secure только за HTTPS и только если Nginx передаёт `X-Forwarded-Proto`); в консоли браузера (F12) нет «mixed content»; `https://ВАШ_ДОМЕН/health/ready` отвечает `{"ok":true,…}`.
Конфиги **не проверялись на реальном сервере** — всегда запускайте `sudo nginx -t` до перезагрузки.

## 5. Бэкапы
    sudo bash deploy/install-backup-timer.sh      # systemd-таймер 04:00 + сторож в 09:00 (рекомендуется вместо cron)
    # Запасной вариант на cron (без сторожа): 0 4 * * * /home/USER/ryazdetailing-backend/deploy/backup-run.sh
    # Важно: запускайте именно backup-run.sh, а не backup.sh — только он шлёт уведомление об ошибке.
Копии лежат в `~/ryazdetailing-backend/backups`. Хранение «дед-отец-сын»: ежедневные за 14 дней, еженедельные за 8 недель, ежемесячные за 12 месяцев (настраивается `KEEP_DAILY` / `KEEP_WEEKLY` / `KEEP_MONTHLY` в `backup.env`). Самая свежая копия не удаляется никогда. Первый раз после обновления скрипта выполните `BACKUP_PRUNE_DRYRUN=1 deploy/backup.sh` — он покажет, что будет удалено, и ничего не удалит. Проверка самой политики: `bash deploy/test-retention.sh`.

**Копии вне сервера (offsite).** Копии только на VPS не защищают от потери самого сервера или диска, поэтому скрипт умеет выгружать их в S3-совместимое хранилище (Cloudflare R2, Backblaze B2 и т.п.) или на другой сервер по SFTP. Перед выгрузкой копии шифруются (gpg, AES-256) — в них имена и телефоны клиентов.

1. Установите инструменты: `sudo apt install rclone gnupg sqlite3`.
2. Создайте пароль шифрования и **сохраните его отдельно** (менеджер паролей) — без него копии не открыть:
   `openssl rand -base64 32 > ~/.ryazdetailing-backup.pass && chmod 600 ~/.ryazdetailing-backup.pass`
3. Скопируйте `deploy/backup.env.example` в `deploy/backup.env`, `chmod 600`, заполните `OFFSITE_REMOTE`, доступы к хранилищу и `BACKUP_PASSPHRASE_FILE` (пример для R2/B2 — в самом файле).
4. Запустите вручную `deploy/backup.sh` — в конце должно быть «выгружено в …». Статус последней выгрузки: `backups/offsite_status.txt`.
5. По желанию заведите бесплатный монитор (healthchecks.io) и вставьте его адрес в `HEALTHCHECK_URL`: если бэкап перестанет выполняться, придёт уведомление.

Без `OFFSITE_REMOTE` скрипт работает как раньше (только локальные копии). Старые копии в хранилище удаляются по той же политике (14 дней / 8 недель / 12 месяцев). Если список файлов в хранилище получить не удалось, скрипт ничего не удаляет. Старая настройка `OFFSITE_KEEP_DAYS` всё ещё понимается как `KEEP_DAILY`.

**Проверка восстановления** (раз в месяц и после изменений схемы БД): `deploy/restore-test.sh` — берёт последнюю локальную копию, `deploy/restore-test.sh --remote` — свежую из хранилища. Скрипт расшифровывает, распаковывает, проверяет целостность БД и таблицы, не трогая рабочую базу.

**Восстановление на новом сервере:** разверните приложение по инструкции выше, остановите его (`pm2 stop ryazdetailing`), расшифруйте и распакуйте копию (`gpg -d файл.gpg | gunzip > data/ryazdetailing.db`, `tar -xzf uploads_….tar.gz`), запустите приложение.

Если offsite не настроен — хотя бы раз в неделю скачивайте `backups/` к себе:
`scp -r USER@IP:~/ryazdetailing-backend/backups ./`

## 6. Замена домена в коде (когда купите)
    grep -rl "ryazdetailing.ru" . | xargs sed -i 's/ryazdetailing\.ru/НОВЫЙ_ДОМЕН/g'
(canonical, Open Graph, JSON-LD, sitemap.xml, robots.txt, .env.example).

## 7. Чек-лист после запуска
- Открывается главная, картинки грузятся
- Цены на сайте = цены из админки
- Вход в админку, тестовая запись появляется в админке
- Повторная запись на то же время → отказ
- Тест Telegram (см. ниже)

## Telegram и Россия
Telegram в РФ замедляют/блокируют, поэтому с российского VPS `api.telegram.org` может не отвечать. Проверка:
    curl -m 8 https://api.telegram.org
Если таймаут — уведомления не дойдут (заявки при этом сохраняются и видны в админке, сайт не ломается). Варианты: VPS за пределами РФ, либо заменить канал уведомлений (например, на email или MAX).


## 9. Логи и сроки хранения (соответствие политике конфиденциальности)
Политика на сайте обещает: логи веб-сервера — не более **14 дней**, журнал действий — 365 дней, заявки и сообщения — 36 месяцев.

- Приложение исполняет сроки заявок/сообщений/журнала само (раз в сутки, `utils/retention.js`; значения — `RETENTION_*` в `.env`).
- Логи Nginx ротируются конфигом из репозитория: `sudo cp deploy/logrotate-ryazdetailing /etc/logrotate.d/ryazdetailing`, затем проверка `sudo logrotate -d /etc/logrotate.d/ryazdetailing`.
- Если меняете срок в `.env` или в logrotate — обязательно меняйте и текст в `privacy.html`, иначе документ перестанет соответствовать системе.
- Конфиги **не проверялись на реальном сервере**.

## 10. Проверка после деплоя
```
bash deploy/check-production.sh ryazdetailing.ru
ADMIN_LOGIN=... ADMIN_PASSWORD=... bash deploy/check-production.sh ryazdetailing.ru   # + cookie входа
```
Скрипт проверяет HTTPS-редиректы, заголовки безопасности, кеш, gzip, закрытые пути, SEO-файлы и cookie. Должно быть `0 FAIL`.
Результат проверки конфигов на тестовом стенде: `deploy/NGINX-CHECK-REPORT.md`.

## 11. Логи
`sudo bash deploy/install-logrotate.sh` ставит ротацию логов nginx и приложения (14 дней). pm2 пишет логи в `logs/` (см. `ecosystem.config.js`);
после обновления конфига: `pm2 reload deploy/ecosystem.config.js && pm2 save`. Логи не содержат паролей, токенов и персональных данных клиентов
(проверяется тестом `tests/loghygiene.js`). Каталог `logs/` закрыт для посторонних (права 750).
