/**
 * Run with: node debug_count.js
 * Connects with the SAME DATABASE_URL the app uses and reports what the app would see.
 * If this prints 225, the discrepancy is in the dev server (restart it).
 * If this prints 205, the discrepancy is on the DB side (RLS, permissions, replica lag).
 */
const { Client } = require("pg");
const fs = require("fs");
const path = require("path");

function loadEnvLocal() {
  const file = path.join(__dirname, ".env.local");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

loadEnvLocal();

(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const user = await client.query("SELECT current_user, current_database()");
    console.log("connected as:", user.rows[0]);

    const schema = process.env.DB_SCHEMA || "public";
    const table = process.env.DB_TABLE || "leads";

    const count = await client.query(
      `SELECT COUNT(*)::bigint AS c FROM "${schema}"."${table}"`
    );
    console.log(`COUNT(*) ${schema}.${table}:`, count.rows[0].c);

    // Are there other tables with the same name on the server?
    const dupes = await client.query(
      `SELECT table_schema, table_name FROM information_schema.tables WHERE table_name = $1`,
      [table]
    );
    console.log(`tables named "${table}" visible to this user:`, dupes.rows);
  } finally {
    await client.end();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
