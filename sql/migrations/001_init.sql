-- cards.fvds.ru — начальная схема (bcrypt, HS256, email-verify, rolling refresh)

create extension if not exists "pgcrypto";   -- gen_random_uuid()
create extension if not exists "citext";     -- case-insensitive email

create table users (
  id                uuid primary key default gen_random_uuid(),
  email             citext unique not null,
  email_verified_at timestamptz,
  password_hash     text not null,
  slug              text unique not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table email_verifications (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete cascade,
  token_sha256 bytea not null,
  expires_at   timestamptz not null,
  used_at      timestamptz,
  created_at   timestamptz not null default now()
);
create index on email_verifications (user_id) where used_at is null;

create table password_resets (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete cascade,
  token_sha256 bytea not null,
  expires_at   timestamptz not null,
  used_at      timestamptz,
  created_at   timestamptz not null default now()
);
create index on password_resets (user_id) where used_at is null;

create table sessions (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references users(id) on delete cascade,
  refresh_token_sha256 bytea not null,
  rotated_at           timestamptz,
  revoked_at           timestamptz,
  user_agent           text,
  ip                   inet,
  created_at           timestamptz not null default now()
);
create unique index on sessions (refresh_token_sha256);
create index on sessions (user_id) where revoked_at is null;

create table login_attempts (
  id         bigserial primary key,
  email      citext,
  ip         inet,
  success    boolean not null,
  created_at timestamptz not null default now()
);
create index on login_attempts (email, created_at);
create index on login_attempts (ip, created_at);

create table profiles (
  user_id     uuid primary key references users(id) on delete cascade,
  full_name   text not null default '',
  position    text,
  phone       text,
  telegram    text,
  about       text,
  avatar_path text,
  social      jsonb not null default '{}',
  updated_at  timestamptz not null default now()
);
