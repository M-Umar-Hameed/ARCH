import { expect, test } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { getKnowledgeSource, upsertVaultFile } from "../src/services/knowledge.js";
import { FakeEmbedder } from "../src/knowledge/embedder.js";

const emb = new FakeEmbedder(1024);

test("vault source refuses paths that are not in the knowledge index", async () => {
  const secret = resolve("package.json"); // real file on disk, never ingested
  const out = await getKnowledgeSource("vault", secret);
  expect(out).toContain("not an indexed vault source");
  expect(out).not.toContain("\"dependencies\"");
});

test("vault source serves an indexed ref", async () => {
  const dir = mkdtempSync(join(tmpdir(), "vault-src-"));
  const file = join(dir, "doc.md");
  writeFileSync(file, `# Doc\nsource-body-${Date.now()}`);
  await upsertVaultFile(file, `# Doc\nsource-body`, emb);
  const out = await getKnowledgeSource("vault", file);
  expect(out).toContain("# Doc");
  rmSync(dir, { recursive: true, force: true });
});
