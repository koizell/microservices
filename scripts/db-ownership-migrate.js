/* eslint-disable */
// Add organizer_* columns to events (idempotent) and assign orphan rows to the
// sole organizer in the system.
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
    await client.query('BEGIN');

    console.log('1) Add organizer_* columns to events (if missing)...');
    await client.query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS organizer_id    VARCHAR(120) NULL`);
    await client.query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS organizer_name  VARCHAR(200) NULL`);
    await client.query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS organizer_email VARCHAR(255) NULL`);

    console.log('2) Identify the sole organizer...');
    const orgRes = await client.query(
      `SELECT id::text AS id, name, email
       FROM users
       WHERE LOWER(account_type) IN ('admin','organizer')
       ORDER BY LOWER(email) ASC`,
    );
    if (orgRes.rows.length === 0) {
      throw new Error('No admin/organizer user found — cannot assign ownership.');
    }
    if (orgRes.rows.length > 1) {
      console.warn(`WARNING: ${orgRes.rows.length} organizers found. Aborting auto-assignment to avoid data contamination.`);
      console.warn('Organizers:', orgRes.rows);
      throw new Error('Multiple organizers detected — manual assignment required.');
    }
    const owner = orgRes.rows[0];
    console.log(`   sole organizer: ${owner.email} (id=${owner.id}, name=${owner.name})`);

    console.log('3) Assign orphan events to that organizer...');
    const beforeEvents = await client.query(
      `SELECT COUNT(*)::int AS orphans FROM events WHERE organizer_id IS NULL AND organizer_email IS NULL`,
    );
    const eventOrphanCount = beforeEvents.rows[0].orphans;
    console.log(`   orphan events before: ${eventOrphanCount}`);
    const upd = await client.query(
      `UPDATE events
       SET organizer_id    = $1,
           organizer_name  = $2,
           organizer_email = $3
       WHERE organizer_id IS NULL AND organizer_email IS NULL`,
      [owner.id, owner.name, String(owner.email).toLowerCase()],
    );
    console.log(`   events updated: ${upd.rowCount}`);

    console.log('4) Verify ticket_types orphans (no auto-assignment if multiple organizers)...');
    const ttOrphans = await client.query(
      `SELECT COUNT(*)::int AS orphans FROM ticket_types WHERE organizer_id IS NULL AND organizer_email IS NULL`,
    );
    const ttOrphanCount = ttOrphans.rows[0].orphans;
    console.log(`   orphan ticket_types: ${ttOrphanCount}`);
    if (ttOrphanCount > 0) {
      const ttUpd = await client.query(
        `UPDATE ticket_types
         SET organizer_id    = $1,
             organizer_name  = $2,
             organizer_email = $3
         WHERE organizer_id IS NULL AND organizer_email IS NULL`,
        [owner.id, owner.name, String(owner.email).toLowerCase()],
      );
      console.log(`   ticket_types updated: ${ttUpd.rowCount}`);
    } else {
      console.log('   nothing to do for ticket_types.');
    }

    await client.query('COMMIT');
    console.log('\nDONE — committed.');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('FAIL — rolled back:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
})();
