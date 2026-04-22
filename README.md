# cards.fvds.ru — сайт электронных визиток

Сайт визиток для коллег ГК «СУ-10». Каждый коллега регистрируется по email+паролю и заполняет свою визитку — она открывается публично по `/c.html?slug=<slug>`.

Архитектура: plain HTML/CSS/JS фронт, Node.js + Express бэк, Yandex Managed PostgreSQL, bcrypt для паролей, stateless HS256 JWT (7 дней) в localStorage. Две темы оформления через CSS-переменные (`data-theme="modern|legacy"`); legacy — точная копия старого макета из `old/app/`.

## Структура

```
cards/
├── old/                # референс-архив старого сайта (не редактировать)
├── public/             # статика (HTML/CSS/JS) — её отдаёт nginx
│   ├── css/
│   │   ├── themes/
│   │   │   ├── modern.css
│   │   │   └── legacy.css
│   │   ├── reset.css
│   │   └── app.css
│   ├── js/
│   │   ├── api.js              # fetch + Bearer из localStorage
│   │   ├── theme.js
│   │   └── lib/escape.js       # textContent helpers (анти-XSS)
│   ├── index.html              # список визиток
│   ├── login.html
│   ├── register.html
│   ├── me.html                 # редактор своей визитки
│   └── c.html                  # публичная карточка (?slug=...)
├── server/             # Node.js API
│   ├── src/
│   │   ├── routes/     # auth (register/login), me, cards
│   │   ├── middleware/ # auth, rate-limit, security-headers
│   │   ├── util/tokens.js
│   │   ├── config.js
│   │   ├── db.js
│   │   └── index.js
│   ├── scripts/migrate.js
│   ├── yandex-root.crt         # CA Yandex Cloud (публичный, в git)
│   ├── .env.example
│   └── package.json
├── sql/migrations/001_init.sql
└── README.md
```

## Локальная разработка

### 1. Подготовка

```powershell
Copy-Item server\.env.example server\.env

# Сгенерировать JWT_SECRET (32+ байт base64) и вставить в server/.env
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Фронт сам определит адрес API: в dev (статика на `:8000` и т.п.) обращается к `http://<host>:3005`, в проде — same-origin через nginx. Файл `public/config.js` не требуется; нужен только если хочется переопределить URL вручную (шаблон — `public/config.example.js`).

### 2. Yandex Managed PostgreSQL

Одна БД `cards` на всё. Dev и prod используют один и тот же кластер через SSL. Все настройки подключения — в `server/.env`.

Подготовка в Yandex Cloud console (одноразово):

1. Кластер Managed PostgreSQL 16 (2 vCPU / 4 GB RAM), регион `ru-central1`.
2. БД `cards`, пользователь `cards_user` с правами на неё.
3. В настройках БД включить **расширения** `pgcrypto` и `citext` (консоль → БД → Изменить → Расширения). Yandex MDB не даёт их создавать через SQL обычному пользователю — только через UI/API кластера.
4. В security group добавить IP локальной машины и IP VPS (`185.200.179.0`).

CA-сертификат уже лежит в `server/yandex-root.crt` (публичный). В `server/.env`:

```
DATABASE_URL=postgresql://cards_user:<password>@rc1a-XXXXXX.mdb.yandexcloud.net:6432/cards?sslmode=verify-full
DB_CA_PATH=./yandex-root.crt
```

Порт `6432` = pg_bouncer (рекомендуется), `5432` = прямое подключение.

### 3. Установка и миграции

```powershell
cd server
npm install
npm run migrate
```

### 4. Запуск

```powershell
# Терминал 1: API на http://localhost:3005
cd server; npm run dev
```
```powershell
# Терминал 2: статика на http://localhost:8000
cd public; python -m http.server 8000
```

Открыть `http://localhost:8000/`.

### 5. Проверка

1. `/register.html` → email + пароль (минимум 6 символов) → сразу попадаешь на `/me.html` (токен выдан auto-login).
2. Заполнить поля, загрузить аватар → «Сохранить».
3. `/` — список всех визиток с заполненным ФИО. `/c.html?slug=<slug>` — публичная карточка.
4. Темы: `?theme=legacy`, `?theme=modern`, либо переключатель в футере `/me`.
5. Logout: кнопка «Выйти» на `/me.html` → очищает `localStorage.cards.token` → редирект на `/`.

## Деплой на VPS

На VPS (`mosgate`, под root):

```bash
# Остановить старый макет
sudo -iu bcard pm2 stop bcard-app
sudo -iu bcard pm2 delete bcard-app
sudo -iu bcard pm2 save

# Развернуть код
sudo -iu bcard bash -c "cd ~ && git clone <repo-url> cards"
sudo -iu bcard bash -c "cd ~/cards/server && npm ci --omit=dev"

# Создать /home/bcard/cards/server/.env (скопировать .env.example и заполнить).
# APP_URL=https://cards.fvds.ru, NODE_ENV=production, CORS_ORIGIN оставить пустым (same-origin).

# Миграции и запуск
sudo -iu bcard bash -c "cd ~/cards/server && npm run migrate"
sudo -iu bcard bash -c "cd ~/cards/server && pm2 start src/index.js --name cards-api && pm2 save"

# Статика и каталог загрузок
sudo -iu bcard bash -c "ln -sfn ~/cards/public ~/public"
sudo -iu bcard mkdir -p ~/uploads
```

Обновить `/etc/nginx/sites-enabled/bcard` — конфиг в плане (`C:\Users\Usr\.claude\plans\transient-bubbling-crown.md`, Шаг 7).

Сертификат: `certbot --nginx -d cards.fvds.ru`.

Применить: `nginx -t && systemctl reload nginx`.

## Администрирование

### Сброс пароля коллеге вручную

В `psql` (расширение `pgcrypto` уже установлено миграцией):

```sql
update users
   set password_hash = crypt('временный_пароль', gen_salt('bf', 12)),
       updated_at = now()
 where email = 'имя.коллеги@su10.ru';
```

Сообщить коллеге временный пароль, попросить сменить на своём профиле (пока эндпоинта смены пароля в UI нет — добавим при необходимости).

### Ротация JWT_SECRET

Поменять `JWT_SECRET` в `server/.env` → `pm2 restart cards-api`. Все выданные токены станут невалидны, коллеги перелогинятся. Используется при подозрении на компрометацию.

### Удаление аккаунта

```sql
delete from users where email = '<email>';
```
Аватар остаётся в `/home/bcard/uploads/` — при необходимости `rm /home/bcard/uploads/<user_id>.webp`.

## Безопасность

- **Пароли:** bcrypt cost=12, минимум 6 символов. Осознанный MVP-выбор (см. memory `feedback_auth_choice.md`). Короткие пароли критичны к утечке дампа БД — ограничить доступ к backup.
- **Rate-limit:** 5 неудач / 15 мин / IP + 10 / час / email (in-memory).
- **JWT:** HS256, 7 дней, в `localStorage`. Logout = клиент удаляет. Серверного revoke нет — при компрометации ротируем `JWT_SECRET`.
- **Нет email-верификации** — защита от спам-регистраций только rate-limit и ручной очисткой `users`.
- **Нет innerHTML** с пользовательскими данными — только textContent.

## Что НЕ включено в MVP

Email-верификация, «забыли пароль» через email, серверные сессии с revoke, 2FA/TOTP, OAuth, CAPTCHA, Redis, метрики, S3-storage. Добавим по мере реальной необходимости.

## Как расширять

- **Новое поле профиля** → миграция `sql/migrations/002_*.sql` + добавить поле в `PROFILE_FIELDS` в [server/src/routes/me.js](server/src/routes/me.js) и в форму [public/me.html](public/me.html).
- **Изменить оформление** → править токены в [public/css/tokens.css](public/css/tokens.css) (цвета, отступы, радиусы, шрифты). Компоненты в [public/css/app.css](public/css/app.css) используют только `var(--*)`, менять их обычно не нужно.
- **Endpoint смены пароля** → `PUT /api/v1/me/password { current, new }` в [server/src/routes/me.js](server/src/routes/me.js) + UI-форма.
