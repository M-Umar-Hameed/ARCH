import { expect, test } from "vitest";
import { chunkMarkdown } from "../src/knowledge/chunker.js";

test("splits on headings into indexed chunks", () => {
  const md = "# A\nalpha text\n\n# B\nbeta text";
  const chunks = chunkMarkdown(md);
  expect(chunks.length).toBe(2);
  expect(chunks[0].index).toBe(0);
  expect(chunks[0].content).toContain("alpha");
  expect(chunks[1].content).toContain("beta");
});

test("subdivides an oversize section", () => {
  const big = "# Big\n" + Array.from({ length: 50 }, (_, i) => `para ${i}`).join("\n\n");
  const chunks = chunkMarkdown(big, 100);
  expect(chunks.length).toBeGreaterThan(1);
  for (const c of chunks) expect(c.content.length).toBeLessThanOrEqual(100 + 40);
});

test("empty input yields no chunks", () => {
  expect(chunkMarkdown("   \n\n ")).toEqual([]);
});
