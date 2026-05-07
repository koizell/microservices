/* eslint-disable */
// Inspect ownership state of events + ticket_types and list organizer users.
const path = require('path');
const fs = require('fs');

const envPath = path.join(__dirname, '..', 'microservices', 'event-service', '.env');
const envText = fs.readFileSync(envPath, 'utf8');
const env = {};
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}

const pgPath = path.join(__dirname, '..', 'microservices', 'event-service', 'node_modules', 'pg');
const { Client } = require(pgPath);

(async () => {
  const client = new Client({
    host: env.DB_HOST || 'localhost',
    port: Number(env.DB_PORT || 5432),
    user: env.DB_USER || 'postgres',
    password: env.DB_PASSWORD,
    database: env.DB_NAME || 'postgres',
  });
  await client.connect();
  try {
    console.log('--- USERS (admin/organizer) ---');
    const users = await client.query(
      `SELECT id::text AS id, name, email, account_type
       FROM users
       WHERE LOWER(account_type) IN ('admin','organizer')
       ORDER BY email`,
    );
    console.table(users.rows);

    console.log('\n--- EVENTS overview ---');
    // Detect if columns exist (the service migration creates them on startup; if service hasn't restarted, they may be missing).
    const cols = await client.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = current_schema() AND table_name = 'events'`,
    );
    const eventCols = new Set(cols.rows.map((r) => r.column_name));
    console.log('event columns present:', [...eventCols].join(', '));
    const hasEventOwner = eventCols.has('organizer_id') && eventCols.has('organizer_email');

    if (hasEventOwner) {
      const summary = await client.query(
        `SELECT
           COUNT(*) FILTER (WHERE organizer_id IS NULL AND organizer_email IS NULL) AS orphans,
           COUNT(*) FILTER (WHERE organizer_id IS NOT NULL OR organizer_email IS NOT NULL) AS owned,
           COUNT(*) AS total
         FROM events`,
      );
      console.log('events ownership summary:', summary.rows[0]);

      const sample = await client.query(
        `SELECT id, title, organizer_id, organizer_email, created_at
         FROM events
         ORDER BY created_at DESC
         LIMIT 20`,
      );
      console.table(sample.rows);
    } else {
      console.log('events table has NO organizer_* columns yet — service must restart to create them.');
      const total = await client.query(`SELECT COUNT(*)::int AS total FROM events`);
      console.log('events total rows:', total.rows[0].total);
    }

    console.log('\n--- TICKET_TYPES overview ---');
    const ttCols = await client.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = current_schema() AND table_name = 'ticket_types'`,
    );
    const ttColSet = new Set(ttCols.rows.map((r) => r.column_name));
    console.log('ticket_types columns present:', [...ttColSet].join(', '));

    if (ttColSet.has('organizer_id') && ttColSet.has('organizer_email')) {
      const summary = await client.query(
        `SELECT
           COUNT(*) FILTER (WHERE organizer_id IS NULL AND organizer_email IS NULL) AS orphans,
           COUNT(*) FILTER (WHERE organizer_id IS NOT NULL OR organizer_email IS NOT NULL) AS owned,
           COUNT(*) AS total
         FROM ticket_types`,
      );
      console.log('ticket_types ownership summary:', summary.rows[0]);

      const breakdown = await client.query(
        `SELECT organizer_email, COUNT(*)::int AS qty
         FROM ticket_types
         GROUP BY organizer_email
         ORDER BY qty DESC`,
      );
      console.table(breakdown.rows);

      const sample = await client.query(
        `SELECT id, name, event_id, organizer_id, organizer_email, created_at
         FROM ticket_types
         ORDER BY created_at DESC
         LIMIT 20`,
      );
      console.table(sample.rows);
    } else {
      console.log('ticket_types table has NO organizer_* columns yet.');
    }
  } finally {
    await client.end();
  }
})().catch((err) => {
  console.error('FAIL:', err.message);
  process.exit(1);
});
