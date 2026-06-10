const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

function loadEnv() {
  const envFiles = ['.env.local', '.env'];
  for (const envFile of envFiles) {
    const file = path.join(__dirname, envFile);
    if (fs.existsSync(file)) {
      for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
        const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
        if (m && !process.env[m[1]]) {
          let val = m[2].trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          process.env[m[1]] = val;
        }
      }
    }
  }
}

loadEnv();

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error("Error: DATABASE_URL environment variable is not set.");
  console.error("Please set it in your environment or define it in a .env.local file.");
  process.exit(1);
}

async function check() {
  const client = new Client({
    connectionString,
  });

  try {
    await client.connect();
    
    console.log("Connected successfully. Fetching schemas and tables...");
    
    const res = await client.query(`
      SELECT table_schema, table_name 
      FROM information_schema.tables 
      WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
      ORDER BY table_schema, table_name;
    `);
    
    console.log(JSON.stringify(res.rows, null, 2));
    
  } catch (err) {
    console.error("Error:", err);
  } finally {
    await client.end();
  }
}

check();
