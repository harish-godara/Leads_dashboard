import { Pool } from "pg";

const DEFAULT_TIMEZONE = "Asia/Kolkata";

// Reuse one pool across HMR reloads in dev. Without this every save would leak connections.
const globalForPool = globalThis as unknown as { __pgPool?: Pool };

function createPool(): Pool {
  const tz = process.env.DB_TIMEZONE || DEFAULT_TIMEZONE;

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    // 20 connections is plenty for a single-page dashboard: each render uses ≤3 short-lived queries.
    max: 20,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    // Server-side timeouts so a runaway query can't hang the page.
    statement_timeout: 15_000,
    query_timeout: 15_000,
    // Apply session GUCs at connection-startup time. Using the `connect` event for this caused a
    // race: the SET TIMEZONE query and the user's first query would both be issued against the
    // same fresh client before the SET resolved, tripping pg's "client is already executing a
    // query" deprecation warning. Passing `-c timezone=…` as a startup option moves the setting
    // into the Postgres handshake itself, so it's already in effect before any query runs.
    options: `-c timezone=${tz}`,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
  });

  pool.on("error", (err) => {
    console.error("Idle PG client error:", err);
  });

  return pool;
}

const pool = globalForPool.__pgPool ?? createPool();
if (process.env.NODE_ENV !== "production") {
  globalForPool.__pgPool = pool;
}

export default pool;
