-- cards.fvds.ru — одна таблица users со всем профилем
-- Расширения pgcrypto и citext должны быть включены в кластере через
-- Yandex Cloud console (Managed PostgreSQL → БД → Изменить → Расширения).
-- gen_random_uuid() есть в PostgreSQL 13+ как built-in, но мы храним хэш
-- паролей и при необходимости ручного сброса удобно иметь crypt() из pgcrypto.

create table users (
  id            uuid primary key default gen_random_uuid(),
  email         citext unique not null,
  password_hash text not null,
  slug          text unique not null,
  full_name     text not null default '',
  position      text,
  phone         text,
  telegram      text,
  about         text,
  avatar_path   text,
  social        jsonb not null default '{}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
