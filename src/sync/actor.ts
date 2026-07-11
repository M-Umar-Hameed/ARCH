import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { actors, type Actor } from "../db/schema.js";
import { createActor } from "../services/actors.js";

// Find-or-create the attribution actor for a source. Sync runs are not concurrent
// (single poll/cron), so a plain find-then-create is sufficient.
// ponytail: no unique-on-name constraint added; add one if concurrent syncs ever run.
export async function resolveSyncActor(source: string): Promise<Actor> {
  const name = `sync:${source}`;
  const [existing] = await db.select().from(actors).where(eq(actors.name, name)).limit(1);
  if (existing) return existing;
  const { actor } = await createActor({ name, kind: "agent" });
  return actor;
}
