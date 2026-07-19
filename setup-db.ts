import postgres from "postgres";
const sql = postgres("postgres://tickets:tickets@localhost:5433/tickets");
async function run() {
  await sql`CREATE EXTENSION IF NOT EXISTS vector`;
  console.log("Vector extension created");
  process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });
