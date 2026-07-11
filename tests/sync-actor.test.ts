import { expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../src/db/client.js";
import { actors } from "../src/db/schema.js";
import { resolveSyncActor } from "../src/sync/actor.js";

test("resolveSyncActor is idempotent by name", async () => {
  const source = `gh-${Date.now()}`;
  const a1 = await resolveSyncActor(source);
  const a2 = await resolveSyncActor(source);
  expect(a1.id).toBe(a2.id);
  expect(a1.name).toBe(`sync:${source}`);
  expect(a1.kind).toBe("agent");
  const rows = await db.select().from(actors).where(eq(actors.name, `sync:${source}`));
  expect(rows).toHaveLength(1);
});
