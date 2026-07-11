import { expect, test } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq, and } from "drizzle-orm";
import { db } from "../src/db/client.js";
import { embeddings } from "../src/db/schema.js";
import { FakeEmbedder } from "../src/knowledge/embedder.js";
import { indexVaultOnce, handleUnlink, setPdfConverter } from "../src/ingest/watch.js";
import { searchKnowledge } from "../src/services/knowledge.js";

const emb = new FakeEmbedder(1024);
const rows = (p: string) =>
  db.select().from(embeddings).where(and(eq(embeddings.sourceKind, "vault"), eq(embeddings.sourceRef, p)));

test("pdf files are converted, indexed, hash-gated, retrievable, and deleted", async () => {
  const uniq = `pdf-${Date.now()}-${Math.round(performance.now() * 1000)}`;
  const md = `# Report ${uniq}\nquarterly numbers and pipeline health`;
  setPdfConverter(async () => md); // fake: no JVM

  const dir = mkdtempSync(join(tmpdir(), "vault-pdf-"));
  const file = join(dir, "report.pdf");
  writeFileSync(file, Buffer.from([0x25, 0x50, 0x44, 0x46, 1, 2, 3])); // "%PDF" + bytes

  const r1 = await indexVaultOnce(dir, emb);
  expect(r1.indexed).toBe(1);
  expect((await rows(file)).length).toBeGreaterThan(0);

  const r2 = await indexVaultOnce(dir, emb);          // unchanged bytes -> skipped
  expect(r2.skipped).toBe(1);
  expect(r2.indexed).toBe(0);

  const hits = await searchKnowledge(md, { limit: 5 }, emb); // query exact converted text
  expect(hits.some((h) => h.sourceRef === file)).toBe(true);

  writeFileSync(file, Buffer.from([0x25, 0x50, 0x44, 0x46, 9, 9, 9])); // changed bytes
  const r3 = await indexVaultOnce(dir, emb);
  expect(r3.indexed).toBe(1);

  await handleUnlink(file);
  expect((await rows(file)).length).toBe(0);

  rmSync(dir, { recursive: true, force: true });
});
