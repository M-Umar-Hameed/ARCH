import { join } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import * as schema from "./schema.js";

// Driver seam: DATABASE_URL -> postgres-js; vitest -> postgres-js fallback (the
// suite stays on real Postgres); otherwise embedded PGlite in ~/.vibeops/data.
const url = process.env.DATABASE_URL;
export const isEmbedded = !url && !process.env.VITEST;

// postgres-js connects lazily, so creating it unconditionally is harmless in
// embedded mode (no runtime code path uses `sql` there after this slice).
export const sql = postgres(url ?? "postgres://tickets:tickets@localhost:5433/tickets");

async function makeDb() {
  if (!isEmbedded) return drizzlePg(sql, { schema });
  const { PGlite } = await import("@electric-sql/pglite");
  const { vector } = await import("@electric-sql/pglite/vector");
  const { drizzle: drizzlePglite } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const client = new PGlite(join(homedir(), ".vibeops", "data"), { extensions: { vector } });
  await client.exec("CREATE EXTENSION IF NOT EXISTS vector");
  const d = drizzlePglite(client as never, { schema });
  await migrate(d as never, { migrationsFolder: fileURLToPath(new URL("../../drizzle", import.meta.url)) });
  return d;
}

export const db = (await makeDb()) as ReturnType<typeof drizzlePg<typeof schema>>;
