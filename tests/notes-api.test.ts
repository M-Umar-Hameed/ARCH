import { expect, test } from "vitest";
import { createActor } from "../src/services/actors.js";
import { app } from "../src/api/app.js";

test("REST notes: create, patch (stale + ok), delete, get-after-delete, list", async () => {
  const { apiKey } = await createActor({ name: `notes-api-${Date.now()}`, kind: "human" });
  const h = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };

  const created = await app.request("/notes", {
    method: "POST", headers: h,
    body: JSON.stringify({ body: "first draft", scope: "global", title: "Runbook" }),
  });
  expect(created.status).toBe(201);
  const note = await created.json();
  expect(note.title).toBe("Runbook");
  expect(note.version).toBe(1);

  const listedBefore = await app.request(`/notes?scope=global`, { headers: h });
  const before = await listedBefore.json();
  expect(before.some((n: { id: string }) => n.id === note.id)).toBe(true);

  const stale = await app.request(`/notes/${note.id}`, {
    method: "PATCH", headers: h,
    body: JSON.stringify({ expectedVersion: 99, body: "nope" }),
  });
  expect(stale.status).toBe(409);

  const patched = await app.request(`/notes/${note.id}`, {
    method: "PATCH", headers: h,
    body: JSON.stringify({ expectedVersion: 1, body: "second draft" }),
  });
  expect(patched.status).toBe(200);
  const updated = await patched.json();
  expect(updated.version).toBe(2);

  const deleted = await app.request(`/notes/${note.id}`, {
    method: "DELETE", headers: h,
    body: JSON.stringify({ expectedVersion: 2 }),
  });
  expect([200, 204]).toContain(deleted.status);

  const gone = await app.request(`/notes/${note.id}`, { headers: h });
  expect(gone.status).toBe(404);

  const listedAfter = await app.request(`/notes?scope=global`, { headers: h });
  const after = await listedAfter.json();
  expect(after.some((n: { id: string }) => n.id === note.id)).toBe(false);
});
