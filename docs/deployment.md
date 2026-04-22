# Развёртывание cards.su10.ru

Документ описывает фактическую архитектуру прода и регламент
обновлений. Сервер: общий VPS `45.80.128.254` (`hub`), Ubuntu 24.04,
nginx + Let's Encrypt + ISPmanager (панель не используется активно,
но управляет iptables — см. ниже). На VPS живут ещё 4 чужих сайта
(`garant`, `let`, `stroyfoto`, `tender` `.su10.ru`); цель деплоя — не
ломать соседей.

## Архитектура

```
                                 Internet
                                    │
                                443/TCP
                                    ▼
                         ┌──────────────────┐
                         │     nginx 1.28   │  master: root
                         │   (общий, OS)    │  worker: www-data
                         └────────┬─────────┘
                                  │
        ┌─────────────────────────┴────────────────────────────┐
        │ /etc/nginx/sites-enabled/cards.su10.ru               │
        │   server_name cards.su10.ru                          │
        │   root /srv/sites/cards.su10.ru/public               │
        │                                                       │
        │   /api/    ──► proxy_pass http://127.0.0.1:3005      │
        │   /uploads/──► proxy_pass http://127.0.0.1:3005      │
        │   /        ──► статика try_files $uri $uri/ =404     │
        └──────────────────────────┬───────────────────────────┘
                                   │ 127.0.0.1:3005
                                   ▼
              ┌─────────────────────────────────────┐
              │ systemd: cards-api.service          │
              │   User=cards (uid 1002)             │
              │   WorkingDirectory=                 │
              │     /srv/sites/cards.su10.ru/server │
              │   EnvironmentFile=…/server/.env     │
              │   ExecStart=/usr/bin/node src/index.js
              │   Bind: 127.0.0.1:3005 (через HOST  │
              │     env + патч в index.js:47)       │
              └──────────────────┬──────────────────┘
                                 │ TLS, port 6432
                                 ▼
                      ┌─────────────────────┐
                      │ Yandex Managed PG   │
                      │   rc1a-…            │
                      │   SSL: yandex-root.crt
                      │   ext: pgcrypto, citext
                      └─────────────────────┘
```

### Файлы на сервере

| Путь | Владелец | Назначение |
|------|----------|------------|
| `/srv/sites/cards.su10.ru/` | `cards:cards` | Корень проекта (git-checkout) |
| `/srv/sites/cards.su10.ru/public/` | `cards:cards` | Статика (отдаёт nginx) |
| `/srv/sites/cards.su10.ru/server/` | `cards:cards` | Backend (Node/Express) |
| `/srv/sites/cards.su10.ru/server/.env` | `cards:cards` 600 | Секреты (DATABASE_URL, JWT_SECRET) |
| `/srv/sites/cards.su10.ru/server/uploads/` | `cards:cards` | Загруженные файлы (writable из systemd) |
| `/srv/sites/cards.su10.ru/server/yandex-root.crt` | `cards:cards` | CA для Yandex Managed PG |
| `/etc/systemd/system/cards-api.service` | `root:root` | systemd-юнит backend |
| `/etc/nginx/sites-available/cards.su10.ru` | `root:root` | nginx-конфиг |
| `/etc/nginx/sites-enabled/cards.su10.ru` | `root:root` | symlink на available |
| `/etc/letsencrypt/live/cards.su10.ru/` | `root:root` | LE-сертификат, авто-renewal |
| `/var/log/nginx/cards.su10.ru.{access,error}.log` | `root:root` | Логи nginx |

### Ключевые отклонения от шаблона

- **Bind на 127.0.0.1.** Express по умолчанию слушает `0.0.0.0`. На VPS
  нет ufw, а iptables управляется ISPmanager — свои DROP-правила добавлять
  нельзя (затрутся при следующем sync панели). Решение — патч одной
  строки в `server/src/index.js`:
  ```js
  app.listen(config.port, process.env.HOST || '127.0.0.1', () => { ... })
  ```
  Файл помечен `git update-index --skip-worktree`, чтобы `git pull` не
  падал на этой правке. В `.env` стоит `HOST=127.0.0.1`.
- **`npm install`, не `npm ci`.** В репозитории отсутствует
  `package-lock.json` (исторический техдолг — никогда не коммитился).
  При первом разворачивании `npm install --omit=dev` сгенерировал
  lock-файл локально на сервере; **этот серверный lock — единственный
  источник правды по версиям**. При обновлениях используем `npm install`
  (см. регламент ниже). Когда lock закоммитят в репо — переключимся на
  `npm ci`.
- **Структура `/srv/sites/`, а не `/home/cards/`.** Скопирована со стиля
  ISPmanager (соседский `garant.su10.ru` лежит в
  `/srv/sites/garant.su10.ru/public`). Унифицированный layout — чтобы
  админ через год не путался.

### Переменные окружения (`.env`)

Все читаются в [`server/src/config.js`](../server/src/config.js).
Файл `.env` не в репо (исключён `.gitignore`); шаблон в
[`server/.env.example`](../server/.env.example).

| Ключ | На проде | Назначение |
|------|----------|------------|
| `NODE_ENV` | `production` | Включает прод-ветки в коде |
| `PORT` | `3005` | Порт listen |
| `HOST` | `127.0.0.1` | Интерфейс listen (см. патч bind) |
| `APP_URL` | `https://cards.su10.ru` | База для абсолютных ссылок |
| `DATABASE_URL` | `postgresql://…@rc1a-…mdb.yandexcloud.net:6432/…` | Yandex Managed PG |
| `DB_CA_PATH` | `./yandex-root.crt` | CA для SSL к Yandex (файл из репо) |
| `JWT_SECRET` | сгенерированный 32-байтный base64 | Подпись JWT (HS256) |
| `JWT_TTL_SECONDS` | `604800` | Срок жизни токена (7 дней) |
| `UPLOADS_DIR` | `./uploads` | Куда multer пишет файлы |
| `MAX_UPLOAD_MB` | `5` | Лимит размера файла |
| `CORS_ORIGIN` | пусто | Фронт и API на одном origin |

## Как обновить прод

Все команды — **от root** на сервере (`hub`).

### Стандартное обновление (код, без новых миграций)

```bash
sudo -iu cards bash -lc '
  cd /srv/sites/cards.su10.ru &&
  git pull &&
  cd server &&
  npm install --omit=dev
'
systemctl restart cards-api
systemctl status cards-api --no-pager | head -15
journalctl -u cards-api -n 20 --no-pager
curl -fsS https://cards.su10.ru/api/v1/health; echo
```

`skip-worktree` на `server/src/index.js` сохранит локальный патч bind —
`git pull` его не затронет.

### Обновление с новыми миграциями БД

```bash
sudo -iu cards bash -lc '
  cd /srv/sites/cards.su10.ru &&
  git pull &&
  cd server &&
  npm install --omit=dev &&
  npm run migrate
'
systemctl restart cards-api
journalctl -u cards-api -n 20 --no-pager
curl -fsS https://cards.su10.ru/api/v1/health; echo
```

Раннер миграций (`server/scripts/migrate.js`) идемпотентен — повторный
запуск безопасен, применятся только новые файлы из `sql/migrations/`.

### Обновление зависимостей

`npm install` подтянет новые пакеты согласно `package.json`. Если хочешь
проверить, что появилось проблемного:

```bash
sudo -iu cards bash -lc 'cd /srv/sites/cards.su10.ru/server && npm audit'
```

Уязвимости фиксить в `dependabot`-стиле (отдельный PR в репо), не на
проде вручную.

### Если правил `index.js` (где патч bind) — конфликт `git pull`

Skip-worktree защищает, но если кто-то закоммитил изменения в
`server/src/index.js`, пул упадёт. Решение:

```bash
sudo -iu cards bash -lc '
  cd /srv/sites/cards.su10.ru &&
  git update-index --no-skip-worktree server/src/index.js &&
  git stash &&
  git pull &&
  git stash pop &&
  git update-index --skip-worktree server/src/index.js
'
```

Если `stash pop` даёт конфликт — разрешить руками (ручной merge между
upstream-версией строки 47 и нашим bind-патчем) и снова включить
skip-worktree. Долгосрочное решение — закоммитить чтение `HOST` из
env прямо в репо и убрать локальный патч.

## Откат после неудачного обновления

### Быстрый откат кода

```bash
sudo -iu cards bash -lc '
  cd /srv/sites/cards.su10.ru &&
  git log --oneline -10 &&
  git reset --hard <SHA-предыдущего-коммита>
' &&
systemctl restart cards-api
```

⚠️ `reset --hard` уничтожает локальные правки. Skip-worktree-файл
(`index.js`) reset тронет — после отката снова применить патч bind
(см. шаг 4 в `.claude/plans/concurrent-hopping-glacier.md`).

### Откат миграции БД

Раннер миграций «однонаправленный» (нет `down`). Если новая миграция
поломала БД — откат через ручной SQL или восстановление из бэкапа Yandex
Managed PG (он делает регулярные снапшоты). Поэтому миграции пишем
аккуратно: только аддитивные изменения (`add column`, `create table`),
без `drop`/`alter type`/`rename` без тщательной подготовки.

### Полный rollback сайта (без удаления соседей)

Если надо снять `cards.su10.ru` целиком, но оставить остальные сайты:

```bash
# 1. отключить в nginx
rm /etc/nginx/sites-enabled/cards.su10.ru
nginx -t && systemctl reload nginx

# 2. остановить backend
systemctl disable --now cards-api

# 3. (опционально) снести начисто
rm /etc/systemd/system/cards-api.service
systemctl daemon-reload
rm /etc/nginx/sites-available/cards.su10.ru
rm -rf /srv/sites/cards.su10.ru
deluser --remove-home cards

# сертификат можно оставить (пригодится при повторе) или
certbot delete --cert-name cards.su10.ru
```

Соседние сайты на любом этапе остаются нетронутыми — у них отдельные
файлы в `sites-available/`, отдельные сертификаты, отдельные процессы.

## Диагностика

### Backend упал

```bash
systemctl status cards-api --no-pager
journalctl -u cards-api -n 100 --no-pager
journalctl -u cards-api --since "10 minutes ago"
ss -ltnp | grep 3005    # должен быть 127.0.0.1:3005
```

Типичные причины:
- `.env` отсутствует или сломан → `EnvironmentFile` не открылся, статус `Failed`.
- `DATABASE_URL` неправильный → backend падает при первом запросе.
- Yandex PG не пускает с IP `45.80.128.254` → `ETIMEDOUT` → разрешить IP в YC console.

### nginx отдаёт 404

```bash
tail -50 /var/log/nginx/cards.su10.ru.access.log
tail -50 /var/log/nginx/cards.su10.ru.error.log
nginx -T 2>/dev/null | sed -n '/server_name cards.su10.ru/,/^}/p'
sudo -u www-data test -r /srv/sites/cards.su10.ru/public/index.html && echo OK || echo FAIL
```

Типичные причины:
- Файл реально отсутствует в `public/`.
- Неправильные права (`chmod o+rx` на `/srv/sites/cards.su10.ru/public`
  и выше — должно быть `755` на каталогах в пути).
- Reload не сработал → `systemctl reload nginx`.

### HTTPS не открывается

```bash
echo | openssl s_client -connect cards.su10.ru:443 -servername cards.su10.ru 2>/dev/null \
  | openssl x509 -noout -subject -dates -issuer
certbot certificates
```

Сертификат выпускался certbot'ом с плагином `--nginx`, авто-продление
работает системным таймером (общий для всех LE-сертов на VPS, ничего
настраивать не нужно):

```bash
systemctl list-timers | grep certbot
certbot renew --dry-run
```

### Соседний сайт сломался после нашего деплоя

Проверка, что наши изменения не задели чужие конфиги:

```bash
# наш конфиг — единственный новый
ls -la /etc/nginx/sites-available/cards.su10.ru
# в чужих файлах не должно быть нашего домена
grep -RIl "cards.su10.ru" /etc/nginx/sites-available/ /etc/nginx/conf.d/
# nginx-test покажет ошибки во всех конфигах
nginx -t
```

Если `nginx -t` валится — починить **только наш** файл, чужие не
трогать. Если соседний сайт лёг по делу (не из-за нас) — это вне зоны
ответственности cards.

## Бэкапы

- **БД** — снапшоты Yandex Managed PG (по расписанию YC). Восстановление
  через YC console, не на сервере.
- **Загруженные файлы (`uploads/`)** — пока без бэкапа. Если важно —
  настроить cron на `cards`:
  ```
  0 3 * * * tar -czf /srv/backup/uploads-$(date +\%F).tar.gz -C /srv/sites/cards.su10.ru/server uploads
  ```
  и периодически выгружать наружу. На текущем этапе MVP не критично.
- **Код** — в git (origin GitHub).
- **`.env` секреты** — нигде, только на сервере. Если потеряем сервер —
  `JWT_SECRET` сгенерировать заново (тогда все выданные токены
  инвалидируются), `DATABASE_URL` восстановить из YC.

## Чеклист первого запуска нового деплоя

Если придётся развернуться повторно (на другом VPS / после обнуления):

- [ ] Подтвердить DNS A-запись на новый IP
- [ ] Установить Node 20 LTS, git, nginx, certbot
- [ ] Создать пользователя `cards`, каталог `/srv/sites/cards.su10.ru/`
- [ ] `git clone` репозитория
- [ ] `npm install --omit=dev` (lock-файла нет)
- [ ] Патч `index.js:47` на bind 127.0.0.1, `git update-index --skip-worktree`
- [ ] Создать `.env` (chmod 600), сгенерировать `JWT_SECRET`
- [ ] Прописать IP сервера в Yandex Managed PG security group
- [ ] `npm run migrate`
- [ ] systemd unit, `enable --now`, проверить bind на `127.0.0.1`
- [ ] nginx-конфиг, certbot, финальный конфиг с proxy_pass
- [ ] Сменить пароль админа `admin@test.com` (по умолчанию `qazwsx12`)
- [ ] Проверить, что соседи на VPS живы

Подробный пошаговый сценарий с командами — в
[`.claude/plans/concurrent-hopping-glacier.md`](../.claude/plans/concurrent-hopping-glacier.md).
