import { expect, test } from "vitest";
import { createActor } from "../src/services/actors.js";
import { createProject } from "../src/services/projects.js";
import { app } from "../src/api/app.js";

function uniq(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

test("verification required tickets block closing until admin verifies", async () => {
  const { apiKey: adminKey } = await createActor({ name: uniq("ver-admin"), kind: "human", role: "admin" });
  const { apiKey: memberKey } = await createActor({ name: uniq("ver-member"), kind: "agent" });
  const adminH = { Authorization: `Bearer ${adminKey}`, "Content-Type": "application/json" };
  const memberH = { Authorization: `Bearer ${memberKey}`, "Content-Type": "application/json" };

  const proj = await (await app.request("/projects", {
    method: "POST", headers: adminH, body: JSON.stringify({ key: uniq("ver-proj"), name: "Verification Proj" }),
  })).json();

  // Create ticket with flag
  const createRes = await app.request("/tickets", {
    method: "POST", headers: memberH, body: JSON.stringify({ projectId: proj.id, title: "needs verification", requiresVerification: true }),
  });
  expect(createRes.status).toBe(201);
  const ticket = await createRes.json();
  expect(ticket.requiresVerification).toBe(true);

  // Close attempt 409s
  const closeRes = await app.request(`/tickets/${ticket.id}`, {
    method: "PATCH", headers: memberH, body: JSON.stringify({ expectedVersion: ticket.version, status: "closed" }),
  });
  expect(closeRes.status).toBe(409);
  expect((await closeRes.json()).error).toBe("verification required before close");

  // Member verification comment with VERIFICATION: PASS does NOT unlock
  await app.request(`/tickets/${ticket.id}/comments`, {
    method: "POST", headers: memberH, body: JSON.stringify({ body: "VERIFICATION: PASS", kind: "verification" }),
  });
  
  const closeRes2 = await app.request(`/tickets/${ticket.id}`, {
    method: "PATCH", headers: memberH, body: JSON.stringify({ expectedVersion: ticket.version, status: "closed" }),
  });
  expect(closeRes2.status).toBe(409);

  // POST /verify by admin then close succeeds
  const verifyRes = await app.request(`/tickets/${ticket.id}/verify`, {
    method: "POST", headers: adminH, body: JSON.stringify({}),
  });
  expect(verifyRes.status).toBe(200);

  const closeRes3 = await app.request(`/tickets/${ticket.id}`, {
    method: "PATCH", headers: memberH, body: JSON.stringify({ expectedVersion: ticket.version, status: "closed" }),
  });
  expect(closeRes3.status).toBe(200);
  expect((await closeRes3.json()).status).toBe("closed");

  // Plain tickets unaffected
  const plainRes = await app.request("/tickets", {
    method: "POST", headers: memberH, body: JSON.stringify({ projectId: proj.id, title: "plain ticket" }),
  });
  const plainTicket = await plainRes.json();
  
  const closeRes4 = await app.request(`/tickets/${plainTicket.id}`, {
    method: "PATCH", headers: memberH, body: JSON.stringify({ expectedVersion: plainTicket.version, status: "closed" }),
  });
  expect(closeRes4.status).toBe(200);
});
