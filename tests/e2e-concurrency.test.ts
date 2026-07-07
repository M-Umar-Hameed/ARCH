import { expect, test } from "vitest";
import { db } from "../src/db/client.js";
import { projects } from "../src/db/schema.js";
import { createActor } from "../src/services/actors.js";
import { createTicket, updateTicket } from "../src/services/tickets.js";
import { getTicketHistory } from "../src/services/history.js";
import { StaleVersionError } from "../src/services/errors.js";

test("two concurrent writers on the same version: exactly one wins", async () => {
  const { actor } = await createActor({ name: "race", kind: "human" });
  const [proj] = await db.insert(projects)
    .values({ key: `p-${Date.now()}-${Math.random()}`, name: "P" }).returning();
  const ticket = await createTicket(actor.id, { projectId: proj.id, title: "contended" });

  const results = await Promise.allSettled([
    updateTicket(actor.id, ticket.id, 1, { title: "writer-A" }),
    updateTicket(actor.id, ticket.id, 1, { title: "writer-B" }),
  ]);
  const wins = results.filter((r) => r.status === "fulfilled");
  const losses = results.filter((r) => r.status === "rejected");
  expect(wins).toHaveLength(1);
  expect(losses).toHaveLength(1);
  expect((losses[0] as PromiseRejectedResult).reason).toBeInstanceOf(StaleVersionError);

  // Audit shows create + exactly one successful update.
  const history = await getTicketHistory(ticket.id);
  expect(history.filter((e) => e.action === "ticket.updated")).toHaveLength(1);
});
