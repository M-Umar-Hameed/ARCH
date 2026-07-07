import { expect, test } from "vitest";
import { FakeEmbedder, getEmbedder } from "../src/knowledge/embedder.js";

test("FakeEmbedder is deterministic and correctly sized", async () => {
  const e = new FakeEmbedder(1024);
  const [a] = await e.embed(["hello"]);
  const [b] = await e.embed(["hello"]);
  expect(a).toHaveLength(1024);
  expect(a).toEqual(b);
  const [c] = await e.embed(["different"]);
  expect(c).not.toEqual(a);
});

test("getEmbedder returns fake when EMBED_PROVIDER=fake", () => {
  process.env.EMBED_PROVIDER = "fake";
  const e = getEmbedder();
  expect(e.dim).toBe(1024);
});

test("unknown model throws", () => {
  process.env.EMBED_PROVIDER = "voyage";
  process.env.EMBED_MODEL = "not-a-real-model";
  expect(() => getEmbedder()).toThrow();
});
