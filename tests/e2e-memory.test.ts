import { expect, test } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq, like } from "drizzle-orm";
import { db } from "../src/db/client.js";
import { embeddings, events } from "../src/db/schema.js";
import { createActor } from "../src/services/actors.js";
import { saveNote } from "../src/services/notes.js";
import { searchKnowledge } from "../src/services/knowledge.js";
import { indexVaultOnce, handleUnlink } from "../src/ingest/watch.js";
import { FakeEmbedder } from "../src/knowledge/embedder.js";

const emb = new FakeEmbedder(1024);

// These tests accumulate one embedding row per run in the shared dev DB; with
// thousands of stale rows the approximate hnsw search can miss the distance-0
// match in a small top-k. Purge THIS file's rows from prior runs only — the
// content markers are unique to these tests, so no other file's rows race.
for (const marker of ["the staging DB password rotates monthly run-%", "# Firewall run-%"]) {
  await db.delete(embeddings).where(like(embeddings.content, marker));
}

test("note saved by session A is retrievable by session B, and audited", async () => {
  const { actor: a } = await createActor({ name: "sessionA", kind: "agent" });

  // FakeEmbedder hashes text with no semantic similarity, and the embeddings
  // table accumulates rows across runs. A unique-per-run marker guarantees this
  // note's text is the sole distance-0 row, so querying the identical text
  // ranks it first regardless of prior runs' content.
  const uniq = `run-${Date.now()}-${Math.round(performance.now() * 1000)}`;
  const body = `the staging DB password rotates monthly ${uniq}`;
  const note = await saveNote(a.id, { body, scope: "global" }, emb);

  // "Session B": a fresh search finds A's memory.
  const hits = await searchKnowledge(body, { limit: 5 }, emb);
  expect(hits.some((h) => h.sourceRef === note.id)).toBe(true);

  const [evt] = await db.select().from(events).where(eq(events.noteId, note.id));
  expect(evt.action).toBe("note.saved");
  expect(evt.actorId).toBe(a.id);
  expect(evt.ticketId).toBeNull();
});

test("vault doc is searchable after index and gone after delete", async () => {
  const dir = mkdtempSync(join(tmpdir(), "vault-e2e-"));
  const uniq = `run-${Date.now()}-${Math.round(performance.now() * 1000)}`;
  // The whole file is short enough to be chunkMarkdown's single section, so the
  // stored chunk content is exactly this string. Querying with the identical
  // string yields a distance-0 match that is unique to this run.
  const content = `# Firewall ${uniq}\nAllow 443 inbound on the edge router.`;
  const file = join(dir, "sop.md");
  writeFileSync(file, content);

  await indexVaultOnce(dir, emb);
  const before = await searchKnowledge(content, { limit: 5 }, emb);
  expect(before.some((h) => h.sourceRef === file)).toBe(true);

  await handleUnlink(file);
  const after = await searchKnowledge(content, { limit: 5 }, emb);
  expect(after.some((h) => h.sourceRef === file)).toBe(false);

  rmSync(dir, { recursive: true, force: true });
});
