import { expect, test } from "vitest";
import { createActor } from "../src/services/actors.js";
import { app } from "../src/api/app.js";

process.env.EMBED_PROVIDER = "fake";

test("REST: POST /ingest/sessions requires auth and returns per-source summary", async () => {
  const unauth = await app.request("/ingest/sessions", { method: "POST", body: "{}" });
  expect(unauth.status).toBe(401);

  const { apiKey } = await createActor({ name: `ingest-api-${Date.now()}`, kind: "human" });
  const h = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };

  const res = await app.request("/ingest/sessions", {
    method: "POST", headers: h,
    body: JSON.stringify({ sinceDays: 0 }),
  });
  expect(res.status).toBe(200);
  const body = await res.json();

  for (const source of ["claude-mem", "claude-code", "codex", "antigravity"]) {
    expect(body[source]).toEqual({
      indexed: expect.any(Number),
      skipped: expect.any(Number),
      failed: expect.any(Number),
    });
  }
});
