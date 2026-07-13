import { expect, test } from "vitest";
import { FakeEmbedder } from "../src/knowledge/embedder.js";
import { upsertVaultFile, searchKnowledge } from "../src/services/knowledge.js";

const emb = new FakeEmbedder(1024);

test("indexed vault content is retrievable and ranked", async () => {
  // FakeEmbedder hashes text, so identical text yields an identical vector (cosine
  // distance 0). The content must be unique per run — otherwise duplicate-content
  // rows from earlier runs in the shared embeddings table also sit at distance 0 and
  // crowd this run's file out of the top-`limit`. A unique marker guarantees exactly
  // one distance-0 row (this run's), so querying that exact text ranks it first.
  const uniq = `run-${Date.now()}-${Math.round(performance.now() * 1000)}`;
  const content = `# Backups ${uniq}\nRun pg_dump nightly to the NAS share.`;
  const p = `note-${uniq}.md`;
  await upsertVaultFile(p, content, emb);
  const hits = await searchKnowledge(content, { limit: 20 }, emb);
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
  const hits = await searchKnowledge("some indexed content", { limit: 20 }, small);
  expect(hits.length).toBe(0);
});
