# Phase 4 — Inbound Sync Framework + GitHub Connector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A source-agnostic inbound sync engine that imports external tickets (GitHub Issues in v1) into the audited engine — idempotently, incrementally, one-way — plus the GitHub reference connector and a poll CLI. Every future source is a thin connector on the same interface.

**Architecture:** Connectors normalize external data into `ExternalTicket[]`; the `runSync` engine owns dedup (`sync_links`/`sync_comment_links`), the incremental cursor, 409-retry, and audited writes under a per-source `sync:<source>` actor via the existing `createTicket`/`updateTicket`/`addComment`.

**Tech Stack:** Node ESM, Drizzle, Postgres, `@octokit/rest`, vitest. Poll-based CLI.

**Spec:** `docs/superpowers/specs/2026-07-11-phase4-inbound-sync-design.md`

## Global Constraints

- Node ESM (`.js` imports). Postgres on host port 5433.
- Imports go through the EXISTING service layer (`createTicket(actorId,{projectId,title,body?})`, `updateTicket(actorId,id,expectedVersion,patch)`, `addComment(actorId,ticketId,body)`, `getTicket(id)`) so every write is audited. Never write `tickets`/`comments`/`events` directly from sync code.
- One-way inbound: the source is authoritative for synced fields; local-only tickets (no `sync_link`) are never touched.
- Idempotent + incremental: re-running never duplicates; `sync_links.externalUpdatedAt` is the cursor and the skip-unchanged guard.
- All external I/O (GitHub) is injected so CI uses fakes — no real GitHub, no token in tests.
- No emojis; minimal comments/logs. Minimal code (ponytail): no connector registry, no config table, no abstraction beyond the one `SourceConnector` interface.
- Reuse verbatim: `createTicket`, `updateTicket`, `addComment`, `getTicket`, `createActor`, `StaleVersionError`.

## File Structure

- `src/db/schema.ts` — add `syncLinks`, `syncCommentLinks` tables + types.
- `src/sync/connector.ts` — `SourceConnector` interface + `ExternalTicket`/`ExternalComment` types.
- `src/sync/actor.ts` — `resolveSyncActor(source)`.
- `src/sync/import.ts` — `runSync(connector, { projectId })` + `SyncResult`.
- `src/sync/connectors/github.ts` — `makeGithubConnector(octokit, repo)`.
- `src/sync/cli.ts` — `npm run sync:github` entrypoint.
- `package.json` — add `@octokit/rest`, `sync:github` script.
- `tests/` — sync-schema, sync-actor, sync-import, github-connector.

---

### Task 1: Schema — sync_links + sync_comment_links

**Files:**
- Modify: `src/db/schema.ts`
- Create: `tests/sync-schema.test.ts`

**Interfaces:**
- Produces tables `syncLinks`, `syncCommentLinks` (each unique on `(source, externalId)`); types `SyncLink`, `SyncCommentLink`.

- [ ] **Step 1: Append tables to `src/db/schema.ts`** (after `embeddings`, before type exports; add `uniqueIndex` to the pg-core import if not present)

```ts
export const syncLinks = pgTable("sync_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  source: text("source").notNull(),
  externalId: text("external_id").notNull(),
  ticketId: uuid("ticket_id").notNull().references(() => tickets.id),
  externalUpdatedAt: timestamp("external_updated_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ uniq: uniqueIndex("sync_links_uniq").on(t.source, t.externalId) }));

export const syncCommentLinks = pgTable("sync_comment_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  source: text("source").notNull(),
  externalId: text("external_id").notNull(),
  commentId: uuid("comment_id").notNull().references(() => comments.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ uniq: uniqueIndex("sync_comment_links_uniq").on(t.source, t.externalId) }));
```
Add type exports:
```ts
export type SyncLink = typeof syncLinks.$inferSelect;
export type SyncCommentLink = typeof syncCommentLinks.$inferSelect;
```

- [ ] **Step 2: Push schema**

Run: `npm run db:push` (creates both tables). Accept non-interactive; if it prompts, note it.

- [ ] **Step 3: Write `tests/sync-schema.test.ts`**

```ts
import { expect, test } from "vitest";
import { sql } from "../src/db/client.js";

test("sync tables exist", async () => {
  const rows = await sql`select table_name from information_schema.tables where table_schema='public'`;
  const names = rows.map((r) => r.table_name);
  expect(names).toContain("sync_links");
  expect(names).toContain("sync_comment_links");
});
```

- [ ] **Step 4: Run + commit**

Run: `npm test -- sync-schema` then full `npm test` then `npm run typecheck`.
```bash
git add -A && git commit -m "feat: sync_links and sync_comment_links mapping tables"
```

---

### Task 2: Connector interface + sync actor

**Files:**
- Create: `src/sync/connector.ts`, `src/sync/actor.ts`, `tests/sync-actor.test.ts`

**Interfaces:**
- `connector.ts`: `SourceConnector` interface, `ExternalTicket`, `ExternalComment` (exact shapes from the spec).
- `actor.ts`: `resolveSyncActor(source: string): Promise<Actor>` — finds actor by `name = "sync:<source>"`, else creates one (`kind: "agent"`). Idempotent.

- [ ] **Step 1: Write `src/sync/connector.ts`**

```ts
export type ExternalComment = { externalId: string; author: string; body: string; createdAt: string };
export type ExternalTicket = {
  externalId: string;
  title: string;
  body: string;
  status: "open" | "in_progress" | "closed";
  updatedAt: string;
  comments: ExternalComment[];
};
export interface SourceConnector {
  source: string;
  listExternalTickets(since?: Date): Promise<ExternalTicket[]>;
}
```

- [ ] **Step 2: Write `tests/sync-actor.test.ts`**

```ts
import { expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../src/db/client.js";
import { actors } from "../src/db/schema.js";
import { resolveSyncActor } from "../src/sync/actor.js";

test("resolveSyncActor is idempotent by name", async () => {
  const source = `gh-${Date.now()}`;
  const a1 = await resolveSyncActor(source);
  const a2 = await resolveSyncActor(source);
  expect(a1.id).toBe(a2.id);
  expect(a1.name).toBe(`sync:${source}`);
  expect(a1.kind).toBe("agent");
  const rows = await db.select().from(actors).where(eq(actors.name, `sync:${source}`));
  expect(rows).toHaveLength(1);
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npm test -- sync-actor` → FAIL (module missing).

- [ ] **Step 4: Write `src/sync/actor.ts`**

```ts
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { actors, type Actor } from "../db/schema.js";
import { createActor } from "../services/actors.js";

// Find-or-create the attribution actor for a source. Sync runs are not concurrent
// (single poll/cron), so a plain find-then-create is sufficient.
// ponytail: no unique-on-name constraint added; add one if concurrent syncs ever run.
export async function resolveSyncActor(source: string): Promise<Actor> {
  const name = `sync:${source}`;
  const [existing] = await db.select().from(actors).where(eq(actors.name, name)).limit(1);
  if (existing) return existing;
  const { actor } = await createActor({ name, kind: "agent" });
  return actor;
}
```

- [ ] **Step 5: Run + commit**

Run: `npm test -- sync-actor` then full `npm test` then `npm run typecheck`.
```bash
git add -A && git commit -m "feat: source connector interface and idempotent sync actor"
```

---

### Task 3: Import engine — runSync

**Files:**
- Create: `src/sync/import.ts`, `tests/sync-import.test.ts`

**Interfaces:**
- Produces `runSync(connector: SourceConnector, opts: { projectId: string }): Promise<SyncResult>` where `SyncResult = { created; updated; skipped; commentsAdded; failed }`.

- [ ] **Step 1: Write `tests/sync-import.test.ts`** (fake in-memory connector)

```ts
import { expect, test } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "../src/db/client.js";
import { projects, events, tickets, syncLinks } from "../src/db/schema.js";
import { runSync } from "../src/sync/import.js";
import type { SourceConnector, ExternalTicket } from "../src/sync/connector.js";

async function newProject() {
  const [p] = await db.insert(projects).values({ key: `p-${Date.now()}-${Math.random()}`, name: "P" }).returning();
  return p.id;
}
function fake(source: string, list: ExternalTicket[]): SourceConnector {
  return { source, listExternalTickets: async () => list };
}

test("import creates, is idempotent, updates, and dedupes comments — all audited", async () => {
  const projectId = await newProject();
  const source = `src-${Date.now()}`;
  const ext: ExternalTicket = {
    externalId: "x#1", title: "First", body: "b", status: "open", updatedAt: "2026-01-01T00:00:00Z",
    comments: [{ externalId: "x#c1", author: "a", body: "hi", createdAt: "2026-01-01T01:00:00Z" }],
  };

  const r1 = await runSync(fake(source, [ext]), { projectId });
  expect(r1.created).toBe(1);
  expect(r1.commentsAdded).toBe(1);

  const [link] = await db.select().from(syncLinks).where(and(eq(syncLinks.source, source), eq(syncLinks.externalId, "x#1")));
  expect(link).toBeDefined();
  const evts = await db.select().from(events).where(eq(events.ticketId, link.ticketId));
  expect(evts.some((e) => e.action === "ticket.created")).toBe(true);
  expect(evts.some((e) => e.action === "comment.added")).toBe(true);

  const r2 = await runSync(fake(source, [ext]), { projectId }); // unchanged
  expect(r2.created).toBe(0);
  expect(r2.skipped).toBe(1);
  expect(r2.commentsAdded).toBe(0); // comment already linked

  const ext2 = { ...ext, title: "First (edited)", updatedAt: "2026-02-01T00:00:00Z" };
  const r3 = await runSync(fake(source, [ext2]), { projectId }); // newer
  expect(r3.updated).toBe(1);
  const [t] = await db.select().from(tickets).where(eq(tickets.id, link.ticketId));
  expect(t.title).toBe("First (edited)");
});

test("closed external ticket imports as closed", async () => {
  const projectId = await newProject();
  const source = `src2-${Date.now()}`;
  const ext: ExternalTicket = { externalId: "y#9", title: "done", body: "", status: "closed", updatedAt: "2026-01-01T00:00:00Z", comments: [] };
  await runSync(fake(source, [ext]), { projectId });
  const [link] = await db.select().from(syncLinks).where(and(eq(syncLinks.source, source), eq(syncLinks.externalId, "y#9")));
  const [t] = await db.select().from(tickets).where(eq(tickets.id, link.ticketId));
  expect(t.status).toBe("closed");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- sync-import` → FAIL.

- [ ] **Step 3: Write `src/sync/import.ts`**

```ts
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { syncLinks, syncCommentLinks } from "../db/schema.js";
import { createTicket, updateTicket } from "../services/tickets.js";
import { addComment } from "../services/comments.js";
import { getTicket } from "../services/history.js";
import { StaleVersionError } from "../services/errors.js";
import { resolveSyncActor } from "./actor.js";
import type { SourceConnector } from "./connector.js";

export type SyncResult = { created: number; updated: number; skipped: number; commentsAdded: number; failed: number };

async function updateOnceWithRetry(
  actorId: string, id: string,
  patch: { title: string; body: string; status: "open" | "in_progress" | "closed" },
): Promise<void> {
  const t = await getTicket(id);
  try {
    await updateTicket(actorId, id, t.version, patch);
  } catch (e) {
    if (!(e instanceof StaleVersionError)) throw e;
    const fresh = await getTicket(id); // retry once with the fresh version
    await updateTicket(actorId, id, fresh.version, patch);
  }
}

export async function runSync(connector: SourceConnector, opts: { projectId: string }): Promise<SyncResult> {
  const actor = await resolveSyncActor(connector.source);
  const res: SyncResult = { created: 0, updated: 0, skipped: 0, commentsAdded: 0, failed: 0 };

  const [latest] = await db.select({ at: syncLinks.externalUpdatedAt }).from(syncLinks)
    .where(eq(syncLinks.source, connector.source)).orderBy(desc(syncLinks.externalUpdatedAt)).limit(1);
  const since = latest?.at ?? undefined;

  const externals = await connector.listExternalTickets(since);
  for (const ext of externals) {
    try {
      const [link] = await db.select().from(syncLinks)
        .where(and(eq(syncLinks.source, connector.source), eq(syncLinks.externalId, ext.externalId))).limit(1);

      let ticketId: string;
      if (!link) {
        const t = await createTicket(actor.id, { projectId: opts.projectId, title: ext.title, body: ext.body });
        if (ext.status !== "open") await updateTicket(actor.id, t.id, t.version, { status: ext.status });
        await db.insert(syncLinks).values({
          source: connector.source, externalId: ext.externalId, ticketId: t.id, externalUpdatedAt: new Date(ext.updatedAt),
        });
        ticketId = t.id;
        res.created++;
      } else {
        ticketId = link.ticketId;
        if (link.externalUpdatedAt && new Date(ext.updatedAt) <= link.externalUpdatedAt) {
          res.skipped++;
        } else {
          await updateOnceWithRetry(actor.id, ticketId, { title: ext.title, body: ext.body, status: ext.status });
          await db.update(syncLinks).set({ externalUpdatedAt: new Date(ext.updatedAt) }).where(eq(syncLinks.id, link.id));
          res.updated++;
        }
      }

      for (const c of ext.comments) {
        const [cl] = await db.select().from(syncCommentLinks)
          .where(and(eq(syncCommentLinks.source, connector.source), eq(syncCommentLinks.externalId, c.externalId))).limit(1);
        if (cl) continue;
        const comment = await addComment(actor.id, ticketId, c.body);
        await db.insert(syncCommentLinks).values({ source: connector.source, externalId: c.externalId, commentId: comment.id });
        res.commentsAdded++;
      }
    } catch (e) {
      console.error(`sync failed for ${ext.externalId}:`, (e as Error).message);
      res.failed++;
    }
  }
  return res;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- sync-import` then full `npm test` then `npm run typecheck`.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: source-agnostic sync import engine with idempotent dedup and 409 retry"
```

---

### Task 4: GitHub connector

**Files:**
- Modify: `package.json`
- Create: `src/sync/connectors/github.ts`, `tests/github-connector.test.ts`

**Interfaces:**
- Produces `makeGithubConnector(octokit: Octokit, repo: string): SourceConnector`.

- [ ] **Step 1: Add `@octokit/rest` to `package.json` and install**

Add `"@octokit/rest": "^21.0.0"` to dependencies. Run `npm install`. (If the installed major differs, note it; the `octokit.paginate` + `issues.listForRepo`/`listComments` API used here is stable across recent majors.)

- [ ] **Step 2: Write `tests/github-connector.test.ts`** (fake Octokit — no network)

```ts
import { expect, test } from "vitest";
import { makeGithubConnector } from "../src/sync/connectors/github.js";

test("maps issues, filters PRs, maps comments", async () => {
  const issues = [
    { number: 1, title: "Bug", body: "desc", state: "open", updated_at: "2026-01-01T00:00:00Z" },
    { number: 2, title: "A PR", body: "", state: "open", updated_at: "2026-01-02T00:00:00Z", pull_request: { url: "x" } },
  ];
  const commentsByIssue: Record<number, any[]> = {
    1: [{ id: 55, user: { login: "alice" }, body: "looks off", created_at: "2026-01-01T01:00:00Z" }],
    2: [],
  };
  const octokit: any = {
    issues: { listForRepo: "LIST", listComments: "COMMENTS" },
    paginate: async (fn: string, params: any) =>
      fn === "LIST" ? issues : (commentsByIssue[params.issue_number] ?? []),
  };

  const conn = makeGithubConnector(octokit, "acme/widgets");
  const out = await conn.listExternalTickets();
  expect(conn.source).toBe("github");
  expect(out).toHaveLength(1); // PR filtered
  expect(out[0].externalId).toBe("acme/widgets#1");
  expect(out[0].status).toBe("open");
  expect(out[0].comments[0].externalId).toBe("acme/widgets#comment-55");
  expect(out[0].comments[0].author).toBe("alice");
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npm test -- github-connector` → FAIL.

- [ ] **Step 4: Write `src/sync/connectors/github.ts`**

```ts
import type { Octokit } from "@octokit/rest";
import type { SourceConnector, ExternalTicket } from "../connector.js";

export function makeGithubConnector(octokit: Octokit, repo: string): SourceConnector {
  const [owner, name] = repo.split("/");
  return {
    source: "github",
    async listExternalTickets(since?: Date): Promise<ExternalTicket[]> {
      const issues = await octokit.paginate(octokit.issues.listForRepo, {
        owner, repo: name, state: "all", since: since?.toISOString(), per_page: 100,
      } as never);
      const out: ExternalTicket[] = [];
      for (const issue of issues as any[]) {
        if (issue.pull_request) continue; // the issues endpoint returns PRs too
        const comments = await octokit.paginate(octokit.issues.listComments, {
          owner, repo: name, issue_number: issue.number, per_page: 100,
        } as never);
        out.push({
          externalId: `${repo}#${issue.number}`,
          title: issue.title,
          body: issue.body ?? "",
          status: issue.state === "closed" ? "closed" : "open",
          updatedAt: issue.updated_at,
          comments: (comments as any[]).map((c) => ({
            externalId: `${repo}#comment-${c.id}`,
            author: c.user?.login ?? "unknown",
            body: c.body ?? "",
            createdAt: c.created_at,
          })),
        });
      }
      return out;
    },
  };
}
```
Note: the fake octokit passes `octokit.issues.listForRepo` as the string `"LIST"`; the real Octokit passes the actual endpoint function. `octokit.paginate(fn, params)` accepts both. The `as never` casts keep the strict tsconfig happy against Octokit's heavily-overloaded types; if `paginate`'s typing rejects them, widen the octokit param to `any` in the signature and note it.

- [ ] **Step 5: Run to verify it passes, then commit**

Run: `npm test -- github-connector` then full `npm test` then `npm run typecheck`.
```bash
git add -A && git commit -m "feat: github issues connector with PR filtering and comment mapping"
```

---

### Task 5: Poll CLI

**Files:**
- Modify: `package.json`
- Create: `src/sync/cli.ts`

**Interfaces:**
- `npm run sync:github` builds the GitHub connector from env and runs `runSync`.

- [ ] **Step 1: Add script to `package.json`**

```json
"sync:github": "tsx src/sync/cli.ts"
```

- [ ] **Step 2: Write `src/sync/cli.ts`**

```ts
import { pathToFileURL } from "node:url";
import { Octokit } from "@octokit/rest";
import { makeGithubConnector } from "./connectors/github.js";
import { runSync } from "./import.js";

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const repo = process.env.SYNC_GITHUB_REPO;
  const projectId = process.env.SYNC_GITHUB_PROJECT;
  if (!repo || !projectId) throw new Error("SYNC_GITHUB_REPO and SYNC_GITHUB_PROJECT are required");
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
  const result = await runSync(makeGithubConnector(octokit, repo), { projectId });
  console.log(JSON.stringify(result));
}
```

- [ ] **Step 3: Typecheck + commit**

Run: `npm run typecheck` then full `npm test` (CLI has no CI test — the entrypoint guard prevents it running on import; it's verified manually).
```bash
git add -A && git commit -m "feat: sync:github poll cli entrypoint"
```

---

## Phase 4 acceptance

- `npm test` green: sync tables exist; `resolveSyncActor` idempotent; import creates/skips/updates + dedupes comments, all audited under `sync:<source>`, closed issues import closed; GitHub connector filters PRs and maps issues+comments against a fake Octokit. Typecheck clean.
- Manual live check: set `GITHUB_TOKEN` + `SYNC_GITHUB_REPO` + `SYNC_GITHUB_PROJECT`, run `npm run sync:github` against a real repo, confirm issues appear as tickets attributed to `sync:github`, and a re-run reports 0 created.

## Self-review notes (done)

- Spec coverage: `SourceConnector` interface (Task 2), mapping tables (Task 1), source-agnostic engine with cursor/dedup/409-retry/audited writes (Task 3), GitHub connector PR-filtered + injectable (Task 4), poll CLI (Task 5). Covered.
- Type consistency: `runSync(connector, {projectId})`, `resolveSyncActor(source)`, `makeGithubConnector(octokit, repo)`, `ExternalTicket`/`ExternalComment` used identically across engine, connector, CLI, and tests.
- Minimal (ponytail): one interface, no connector registry, no config table, no unique-on-name (documented `ponytail:` ceiling — single-run sync). New closed issues use create+update (2 audited writes) rather than extending Phase 1 `createTicket` — smaller blast radius than changing a core signature.
- Flagged latitude: Octokit's overloaded `paginate` types may need an `any` widening under strict tsconfig (Task 4 note); `@octokit/rest` major may differ (Task 4 Step 1 note).
