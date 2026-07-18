import { expect, test, vi } from "vitest";
import { upsertSourceDoc, knowledgeGraph } from "../src/services/knowledge.js";
import { app } from "../src/api/app.js";
import { FakeEmbedder } from "../src/knowledge/embedder.js";
import { createActor } from "../src/services/actors.js";

const emb = new FakeEmbedder(1024);

test("knowledgeGraph returns nodes and edges with twin similarities", async () => {
  const ref1 = `graph-twin-1-${Date.now()}`;
  const ref2 = `graph-twin-2-${Date.now()}`;
  const ref3 = `graph-unique-${Date.now()}`;
  
  await upsertSourceDoc("session", ref1, "identical content for testing twins", emb);
  await upsertSourceDoc("session", ref2, "identical content for testing twins", emb);
  await upsertSourceDoc("session", ref3, "completely different random string", emb);
  
  const res = await knowledgeGraph(60);
  expect(res.nodes.length).toBeGreaterThanOrEqual(3);
  
  const edge = res.edges.find(e => 
    (e.a === ref1 && e.b === ref2) || (e.a === ref2 && e.b === ref1)
  );
  expect(edge).toBeDefined();
  expect(edge!.w).toBeGreaterThan(0.9);
  
  const capped = await knowledgeGraph(2);
  expect(capped.nodes.length).toBeLessThanOrEqual(2);
});

test("GET /knowledge/graph returns 200", async () => {
  const { apiKey } = await createActor({ name: "Graph Tester", kind: "human", role: "member" });
  
  const res = await app.request("/knowledge/graph?limit=5", {
    headers: { Authorization: `Bearer ${apiKey}` }
  });
  
  expect(res.status).toBe(200);
});

