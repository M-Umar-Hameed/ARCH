import { expect, test } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "../src/db/client.js";
import { embeddings } from "../src/db/schema.js";
import { upsertSourceDoc, searchKnowledge } from "../src/services/knowledge.js";
import { FakeEmbedder } from "../src/knowledge/embedder.js";

const emb = new FakeEmbedder(1024);

test("session sourceKind round-trips through upsertSourceDoc with hash gating semantics", async () => {
  const ref = `claude-mem#test-${Date.now()}`;
  const text = `# Session\nunique-session-marker-${Date.now()}-${Math.round(performance.now() * 1000)}`;
  const n = await upsertSourceDoc("session", ref, text, emb, "hash-1");
  expect(n).toBeGreaterThan(0);
  const rows = await db.select().from(embeddings)
    .where(and(eq(embeddings.sourceKind, "session"), eq(embeddings.sourceRef, ref)));
  expect(rows.length).toBe(n);
  expect(rows[0].contentHash).toBe("hash-1");
  const hits = await searchKnowledge(text, { limit: 5 }, emb);
  expect(hits.some((h) => h.sourceRef === ref && h.sourceKind === "session")).toBe(true);
});
