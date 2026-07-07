import {
  pgTable, uuid, text, integer, timestamp, jsonb, pgEnum, index,
} from "drizzle-orm/pg-core";

export const ticketStatus = pgEnum("ticket_status", ["open", "in_progress", "closed"]);
export const ticketPriority = pgEnum("ticket_priority", ["low", "normal", "high"]);
export const actorKind = pgEnum("actor_kind", ["human", "agent"]);

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const actors = pgTable("actors", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  kind: actorKind("kind").notNull(),
  role: text("role").notNull().default("member"),
  apiKeyHash: text("api_key_hash").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const tickets = pgTable("tickets", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  status: ticketStatus("status").notNull().default("open"),
  priority: ticketPriority("priority").notNull().default("normal"),
  assigneeId: uuid("assignee_id").references(() => actors.id),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ projectIdx: index("tickets_project_idx").on(t.projectId) }));

export const comments = pgTable("comments", {
  id: uuid("id").primaryKey().defaultRandom(),
  ticketId: uuid("ticket_id").notNull().references(() => tickets.id),
  authorId: uuid("author_id").notNull().references(() => actors.id),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ ticketIdx: index("comments_ticket_idx").on(t.ticketId) }));

// Append-only. No UPDATE, no DELETE, ever.
export const events = pgTable("events", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorId: uuid("actor_id").notNull().references(() => actors.id),
  ticketId: uuid("ticket_id").notNull().references(() => tickets.id),
  action: text("action").notNull(), // e.g. ticket.created, ticket.updated, comment.added
  changes: jsonb("changes").$type<Record<string, { from: unknown; to: unknown }>>(),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ ticketIdx: index("events_ticket_idx").on(t.ticketId) }));

export type Ticket = typeof tickets.$inferSelect;
export type NewTicket = typeof tickets.$inferInsert;
export type Actor = typeof actors.$inferSelect;
export type Comment = typeof comments.$inferSelect;
export type Event = typeof events.$inferSelect;
