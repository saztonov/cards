// bcrypt инжектируется из server/scripts/migrate.js как deps.bcrypt —
// напрямую импортировать npm-пакеты отсюда нельзя (node_modules лежит
// в server/, а эта миграция в sql/migrations/).

// Первый админ. После первого запуска миграции запись будет в _migrations,
// повторно не применится. Смена пароля — через psql или через будущий
// endpoint смены пароля в /me.
const ADMIN_EMAIL = 'admin@test.com';
const ADMIN_PASSWORD = 'qazwsx12';

export async function up(client, { bcrypt }) {
  const { rows } = await client.query("select 1 from users where role = 'admin' limit 1");
  if (rows.length) return;

  const password_hash = await bcrypt.hash(ADMIN_PASSWORD, 12);

  await client.query(
    `insert into users (email, password_hash, slug, full_name, role, is_active)
     values ($1, $2, 'admin', 'Администратор', 'admin', true)
     on conflict (email) do update set role = 'admin', is_active = true`,
    [ADMIN_EMAIL, password_hash]
  );
}
