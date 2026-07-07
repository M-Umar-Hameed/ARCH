import { expect, test } from "vitest";
import { FakeEmbedder } from "../src/knowledge/embedder.js";
import { upsertVaultFile, searchKnowledge } from "../src/services/knowledge.js";

const emb = new FakeEmbedder(1024);

test("indexed vault content is retrievable and ranked", async () => {
  const p = `note-${Date.now()}.md`;
  await upsertVaultFile(p, "# Backups\nRun pg_dump nightly to the NAS share.", emb);
  const hits = await searchKnowledge("how do we back up postgres", { limit: 5 }, emb);
  expect(hits.length).toBeGreaterThan(0);
  const mine = hits.find((h) => h.sourceRef === p);
  expect(mine).toBeDefined();
  expect(mine!.citation).toBe(p);
});

test("dim mismatch rows are excluded", async () => {
  // Index at 1024 dims, then query with a 512-dim embedder. No 512-dim rows
  // exist anywhere in the store, and the 1024-dim rows must be filtered out,
  // so the result is empty (proves the dim filter, not just no-throw).
  await upsertVaultFile(`dim-${Date.now()}.md`, "# X\nsome indexed content", emb);
  const small = new FakeEmbedder(512);
  const hits = await searchKnowledge("some indexed content", { limit: 5 }, small);
  expect(hits.length).toBe(0);
});
