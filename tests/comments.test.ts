import { expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../src/db/client.js";
import { projects, events } from "../src/db/schema.js";
import { createActor } from "../src/services/actors.js";
import { createTicket } from "../src/services/tickets.js";
import { addComment } from "../src/services/comments.js";

test("adding a comment records a comment.added event", async () => {
  const { actor } = await createActor({ name: "c", kind: "agent" });
  const [proj] = await db.insert(projects)
    .values({ key: `p-${Date.now()}-${Math.random()}`, name: "P" }).returning();
  const ticket = await createTicket(actor.id, { projectId: proj.id, title: "T" });

  const comment = await addComment(actor.id, ticket.id, "looks broken");
  expect(comment.body).toBe("looks broken");

  const evts = await db.select().from(events).where(eq(events.ticketId, ticket.id));
  expect(evts.map((e) => e.action)).toContain("comment.added");
});
