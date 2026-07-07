import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema.js";

const url = process.env.DATABASE_URL ?? "postgres://tickets:tickets@localhost:5433/tickets";

export const sql = postgres(url);
export const db = drizzle(sql, { schema });
