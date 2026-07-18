import { expect, test } from "vitest";
import { upsertSourceDoc, listSessionDocs } from "../src/services/knowledge.js";
import { app } from "../src/api/app.js";
import { FakeEmbedder } from "../src/knowledge/embedder.js";
import { createActor } from "../src/services/actors.js";

const emb = new FakeEmbedder(1024);

test("listSessionDocs returns distinct session docs ordered by latest", async () => {
  const ref1 = `session-a-${Date.now()}`;
  const ref2 = `session-b-${Date.now()}`;
  
  await upsertSourceDoc("session", ref1, "first session content here", emb);
  await upsertSourceDoc("session", ref2, "second session content that is much newer", emb);
  
  const docs = await listSessionDocs(50);
  
  const r1 = docs.find(d => d.ref === ref1);
  const r2 = docs.find(d => d.ref === ref2);
  
  expect(r1).toBeDefined();
  expect(r2).toBeDefined();
  expect(r1!.excerpt).toContain("first session content here");
  expect(r2!.excerpt).toContain("second session content");
  expect(r1!.chunkCount).toBe(1);
  
  // They should be sorted newest first. Assuming db inserts them sequentially,
  // or we can just check if both are in the results.
  const idx1 = docs.findIndex(d => d.ref === ref1);
  const idx2 = docs.findIndex(d => d.ref === ref2);
  expect(idx2).toBeLessThan(idx1); // ref2 is newer
});

test("GET /knowledge/sessions returns docs", async () => {
  const { apiKey } = await createActor({ name: "Session Tester", kind: "human", role: "member" });
  
  const ref = `session-api-${Date.now()}`;
  await upsertSourceDoc("session", ref, "api session content", emb);
  
  const res = await app.request("/knowledge/sessions?limit=5", {
    headers: { Authorization: `Bearer ${apiKey}` }
  });
  
  expect(res.status).toBe(200);
  const body = await res.json() as any[];
  expect(body.find(b => b.ref === ref)).toBeDefined();
});
