const { Client } = require('pg');

async function check() {
  const client = new Client({
    connectionString: "postgresql://dobby_onwer:71km6SMLjTRe@13.200.146.176:5432/dobby",
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
