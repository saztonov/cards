alter table users
  add column role text not null default 'user',
  add column is_active boolean not null default false;

alter table users
  add constraint users_role_check check (role in ('user','admin'));
