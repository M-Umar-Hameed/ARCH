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
  const saved = { EMBED_PROVIDER: process.env.EMBED_PROVIDER, EMBED_MODEL: process.env.EMBED_MODEL };
  try {
    process.env.EMBED_PROVIDER = "voyage";
    process.env.EMBED_MODEL = "not-a-real-model";
    expect(() => getEmbedder()).toThrow();
  } finally {
    if (saved.EMBED_PROVIDER === undefined) delete process.env.EMBED_PROVIDER; else process.env.EMBED_PROVIDER = saved.EMBED_PROVIDER;
    if (saved.EMBED_MODEL === undefined) delete process.env.EMBED_MODEL; else process.env.EMBED_MODEL = saved.EMBED_MODEL;
  }
});
