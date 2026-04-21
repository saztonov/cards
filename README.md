# cards.fvds.ru — сайт электронных визиток

Сайт визиток для коллег ГК «СУ-10». Каждый коллега заводит личный аккаунт, подтверждает email и заполняет свою визитку — открывается по публичной ссылке `/c.html?slug=<slug>`.

Архитектура: plain HTML/CSS/JS фронт, Node.js + Express бэк, PostgreSQL, bcrypt для паролей, HS256 JWT access + opaque refresh в `__Host-` cookie. Две темы оформления через CSS-переменные (`data-theme="modern|legacy"`), legacy — точная копия старого макета из `old/app/`.

## Структура

```
cards/
├── old/                # референс-архив старого сайта (не редактировать)
├── public/             # статика (HTML/CSS/JS) — её отдаёт nginx
│   ├── css/
│   │   ├── themes/
│   │   │   ├── modern.css     # современные токены
│   │   │   └── legacy.css     # точная копия старого визуала
│   │   ├── reset.css
│   │   └── app.css            # все компоненты через var(--*)
│   ├── js/
│   │   ├── api.js             # fetch-обёртка с auto-refresh
│   │   ├── auth.js (в api.js) # access в памяти вкладки
│   │   ├── theme.js           # переключение темы
│   │   └── lib/escape.js      # textContent helpers
│   ├── index.html             # список визиток
│   ├── login.html / register.html / password-forgot.html / reset.html
│   ├── me.html                # редактор своей визитки
│   └── c.html                 # публичная карточка (?slug=...)
├── server/             # Node.js API
│   ├── src/
│   │   ├── routes/     # auth, me, cards
│   │   ├── middleware/ # auth, rate-limit, security-headers
│   │   ├── util/       # tokens, slugify, hashing
│   │   ├── config.js   # загрузка env
│   │   ├── db.js       # pg pool
│   │   ├── mail.js     # nodemailer
│   │   └── index.js    # express app
│   ├── scripts/migrate.js
│   └── package.json
├── sql/migrations/001_init.sql
└── README.md (этот файл)
```

## Локальная разработка (Windows)

### 1. Подготовка

```powershell
# В корне проекта скопировать конфиги
Copy-Item server\.env.example server\.env
Copy-Item public\config.example.js public\config.js

# Сгенерировать секрет JWT (любые 32+ байт base64)
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
# Вставить результат в server/.env как JWT_SECRET=...
```

### 2. Yandex Managed PostgreSQL

Одна БД на всё — `cards`. Отличаются только строки подключения: локально и прод используют один и тот же кластер через SSL. Все настройки (хост, пользователь, пароль, имя БД) — в `server/.env`.

Подготовка в Yandex Cloud console (одноразово):

1. Создать кластер Managed PostgreSQL 16 (2 vCPU / 4 GB RAM для старта), регион `ru-central1`.
2. Создать БД `cards` и пользователя `cards_user` с правами на неё.
3. В security group кластера добавить IP локальной машины и IP VPS (`185.200.179.0`).

CA-сертификат Яндекса уже лежит в `server/yandex-root.crt` (скачан из `https://storage.yandexcloud.net/cloud-certs/CA.pem`). Публичный, в git безопасно.

В `server/.env` прописать (хост — FQDN из консоли Yandex Cloud):

```
DATABASE_URL=postgresql://cards_user:<password>@rc1a-XXXXXX.mdb.yandexcloud.net:6432/cards?sslmode=verify-full
DB_CA_PATH=./yandex-root.crt
```

Порт `6432` = pg_bouncer (рекомендуется), `5432` — прямое подключение к мастеру.

### 3. Установка и миграции

```powershell
cd server
npm install
npm run migrate
```

### 4. Запуск

Два терминала:

```powershell
# Терминал 1: API на http://localhost:3005
cd server
npm run dev
```

```powershell
# Терминал 2: статика на http://localhost:8000
cd public
python -m http.server 8000
```

Открыть `http://localhost:8000/`.

### 5. Проверка

1. `/register.html` → ввести email и пароль (минимум 6 символов). Письмо увидишь в консоли API (SMTP не настроен в dev).
2. Перейти по verify-ссылке из лога → редирект на `/login.html?verified=1`.
3. Войти → попадёшь на `/me.html` → заполнить поля + аватар → «Сохранить».
4. Открыть `/c.html?slug=<slug>` — публичная визитка. `/` — список всех.
5. Проверка тем: `?theme=legacy`, `?theme=modern`, или переключатель в футере.

## Yandex Cloud подготовка (перед деплоем на VPS)

1. **Managed PostgreSQL** — кластер уже создан (см. раздел «Локальная разработка» выше). IP VPS уже в security group.
2. **Lockbox** — создать 3 секрета:
   - `cards/jwt-hs256` — случайные 32+ байт base64 (ключ: `secret`)
   - `cards/db-password` — пароль пользователя БД (ключ: `password`)
   - `cards/smtp-password` — пароль SMTP (ключ: `password`)
3. **Сервисный аккаунт** с ролью `lockbox.payloadViewer`. Создать авторизованный ключ и положить на VPS в `/home/bcard/.yc-key.json` (chmod 600, owner bcard). Это даст `yc` CLI чтение секретов без ввода пароля.
4. **SMTP** — Yandex Postbox или любой другой (Mailgun/SendGrid). Настроить SPF/DKIM для `cards.fvds.ru`.

## Деплой на VPS

На VPS (mosgate, под root):

```bash
# Остановить старый макет
sudo -iu bcard pm2 stop bcard-app
sudo -iu bcard pm2 delete bcard-app
sudo -iu bcard pm2 save

# Установить код
sudo -iu bcard bash -c "cd ~ && git clone <repo-url> cards"
sudo -iu bcard bash -c "cd ~/cards/server && npm ci --omit=dev"

# Создать и заполнить ~/cards/server/.env (секреты из Lockbox через yc lockbox payload get ...)

# Миграции
sudo -iu bcard bash -c "cd ~/cards/server && npm run migrate"

# Запуск
sudo -iu bcard bash -c "cd ~/cards/server && pm2 start src/index.js --name cards-api && pm2 save"

# Линковать статику (nginx ожидает её в /home/bcard/public)
sudo -iu bcard bash -c "ln -sfn ~/cards/public ~/public"
sudo -iu bcard mkdir -p ~/uploads
```

Обновить `/etc/nginx/sites-enabled/bcard` согласно разделу «Шаг 7» из плана (`C:\Users\Usr\.claude\plans\transient-bubbling-crown.md`).

Получить сертификат: `certbot --nginx -d cards.fvds.ru`.

Проверить: `nginx -t && systemctl reload nginx`.

## Переключение темы централизованно

Дефолтная тема для всех новых посетителей задаётся через env-переменную сервера (но влияет она только на HTML-атрибут `<html data-default-theme="...">`, который сервер сейчас не инжектит — в MVP это пока статично в HTML). Для глобального отката на легаси:

1. Отредактировать HTML-страницы в `public/` (заменить `data-default-theme="modern"` на `"legacy"`).
2. Либо в будущем — дать серверу рендерить стартовый HTML с `data-default-theme` из env.

Индивидуальный выбор пользователя всегда имеет приоритет (сохраняется в `localStorage.cards.theme`).

## Безопасность

- Пароли: bcrypt cost=12, минимум 6 символов. Это сознательный MVP-выбор. При утечке БД 6-символьные пароли вскрываются за часы — **ни в коем случае не допускать утечки дампов БД**.
- Rate-limit: 5 неудач / 15 мин / IP + 10 неудач / час / email.
- Refresh-токены: opaque 256 бит, ротируются, reuse = revoke всей сессии.
- Access-токены: HS256, 15 мин, только в памяти вкладки.
- Нет innerHTML с пользовательскими данными — только textContent.

## Как расширять

- **Новые поля профиля** — добавить в `sql/migrations/` новый файл `002_*.sql` и в `server/src/routes/me.js` (`PROFILE_FIELDS`).
- **2FA / OAuth** — отдельный pass после запуска MVP.
- **Новая тема** — добавить файл в `public/css/themes/`, добавить в `public/js/theme.js` в `THEMES` и линки во всех HTML.
