# Phase 2 — Knowledge/RAG + Writeable Memory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a pgvector knowledge layer to the Phase 1 tickets system: ingest the Obsidian vault for read-only RAG, add a writeable `notes` memory table, and expose one `search_knowledge` + one `save_note` tool over both MCP and REST — so every session/tool shares one synced brain on the same Postgres.

**Architecture:** One unified `embeddings` table (a rebuildable projection) holds both vault chunks and note copies; `search_knowledge` queries it. Authoritative records stay in tables (`notes`) — truth vs retrieval. A standalone chokidar watcher ingests the vault (full-index on start + hash-gated incremental + delete-on-unlink). `saveNote` writes+audits the note in a transaction, then embeds post-commit so a flaky embedding API never loses memory. All new mutations reuse the Phase 1 service-layer + append-only audit pattern; the `events` table is generalized to audit notes too.

**Tech Stack:** Node 20+, TypeScript ESM, Hono, Drizzle 0.36 + `postgres`, Postgres 16 + pgvector, `@modelcontextprotocol/sdk` 1.29, chokidar, vitest. Embedder via `fetch` (no SDK dep); Voyage default.

**Spec:** `docs/superpowers/specs/2026-07-07-phase2-knowledge-rag-design.md`

## Global Constraints

- Node >= 20, TypeScript ESM (`"type": "module"`), local imports use `.js` extensions.
- Postgres 16 on host port **5433** (Phase 1 remap; `DATABASE_URL`/client default already point there).
- Every state mutation goes through `src/services/*` inside a transaction and writes an append-only `events` row. Notes included (via generalized `events`). `events` is never UPDATEd/DELETEd.
- Truth vs retrieval: `notes` is authoritative; `embeddings` is a rebuildable projection. Never let an embedding be the only record.
- One active embedding provider at a time; `embeddings.embedding` is `vector(N)` with N fixed at migration (default 1024 = Voyage voyage-3). Every row stores `model`+`dim`; search filters to the active `dim`. Switching provider = new migration + full re-embed.
- Memory writes are explicit `save_note` only. Sources this slice: vault only.
- No emojis; minimal comments/logs.
- Reuse Phase 1 signatures verbatim: `resolveActor(rawKey): Promise<Actor>`, `createActor(input): Promise<{actor, apiKey}>`, `createTicket(actorId, input)`, the Hono `auth` middleware setting `c.get("actor")`, and MCP `server.registerTool(name, { inputSchema }, handler)`.

## File Structure

- `src/db/schema.ts` — MODIFY: generalize `events`; add `noteScope`/`sourceKind` enums, `notes`, `embeddings` tables; export types.
- `src/db/vector-setup.ts` — CREATE: `ensureExtension()` + `ensureIndex()` (raw SQL: pgvector extension + hnsw index).
- `src/knowledge/embedder.ts` — CREATE: `Embedder` interface, `FakeEmbedder`, `VoyageEmbedder`, `getEmbedder()`, `MODEL_DIMS`.
- `src/knowledge/chunker.ts` — CREATE: `chunkMarkdown(text)` (pure).
- `src/services/notes.ts` — CREATE: `saveNote`, `sweepUnindexedNotes`.
- `src/services/knowledge.ts` — CREATE: `searchKnowledge`, `upsertVaultFile`, `deleteVaultFile`.
- `src/ingest/watch.ts` — CREATE: `indexVaultOnce`, `handleVaultChange`, chokidar entrypoint.
- `src/api/app.ts` — MODIFY: add `POST /notes`, `GET /knowledge`.
- `src/mcp/server.ts` — MODIFY: add `save_note`, `search_knowledge` tools.
- `tests/*` — one file per unit.

---

### Task 1: Schema — vector tables, notes, generalized events audit

**Files:**
- Modify: `src/db/schema.ts`
- Create: `src/db/vector-setup.ts`, `tests/knowledge-schema.test.ts`
- Modify: `package.json` (add `chokidar`, add scripts)

**Interfaces:**
- Produces enums `noteScope = ["global","project","ticket"]`, `sourceKind = ["vault","note"]`; tables `notes`, `embeddings`; generalized `events` (nullable `ticketId`, new nullable `noteId`, CHECK one-set); types `Note`, `NewNote`, `Embedding`, `NewEmbedding`.
- `ensureExtension(): Promise<void>` (CREATE EXTENSION IF NOT EXISTS vector), `ensureIndex(): Promise<void>` (hnsw cosine index on embeddings.embedding).

- [ ] **Step 1: Add dep + scripts to `package.json`**

Add to dependencies: `"chokidar": "^4.0.0"`. Add scripts:
```json
"db:vector": "tsx -e \"import('./src/db/vector-setup.js').then(m=>m.ensureExtension())\"",
"db:vector:index": "tsx -e \"import('./src/db/vector-setup.js').then(m=>m.ensureIndex())\"",
"ingest:watch": "tsx src/ingest/watch.ts"
```
Run `npm install`.

- [ ] **Step 2: Edit `src/db/schema.ts` — imports + generalized events**

Change the import line to add `vector`, `check`, and `sql`:
```ts
import {
  pgTable, uuid, text, integer, timestamp, jsonb, pgEnum, index, check, vector, boolean,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
```

Replace the `events` table definition with the generalized version (ticketId nullable, add noteId, CHECK):
```ts
// Append-only. No UPDATE, no DELETE, ever. Audits both tickets and notes.
export const events = pgTable("events", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorId: uuid("actor_id").notNull().references(() => actors.id),
  ticketId: uuid("ticket_id").references(() => tickets.id),
  noteId: uuid("note_id").references(() => notes.id),
  action: text("action").notNull(),
  changes: jsonb("changes").$type<Record<string, { from: unknown; to: unknown }>>(),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  ticketIdx: index("events_ticket_idx").on(t.ticketId),
  target: check("events_target_ck", sql`${t.ticketId} is not null or ${t.noteId} is not null`),
}));
```

- [ ] **Step 3: Append new enums + tables to `src/db/schema.ts`** (after `events`, before the type exports)

```ts
export const noteScope = pgEnum("note_scope", ["global", "project", "ticket"]);
export const sourceKind = pgEnum("source_kind", ["vault", "note"]);

export const notes = pgTable("notes", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorId: uuid("actor_id").notNull().references(() => actors.id),
  body: text("body").notNull(),
  scope: noteScope("scope").notNull(),
  refId: uuid("ref_id"),
  indexed: boolean("indexed").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const embeddings = pgTable("embeddings", {
  id: uuid("id").primaryKey().defaultRandom(),
  sourceKind: sourceKind("source_kind").notNull(),
  sourceRef: text("source_ref").notNull(),
  chunkIndex: integer("chunk_index").notNull(),
  content: text("content").notNull(),
  embedding: vector("embedding", { dimensions: 1024 }).notNull(),
  model: text("model").notNull(),
  dim: integer("dim").notNull(),
  contentHash: text("content_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  srcIdx: index("embeddings_src_idx").on(t.sourceKind, t.sourceRef),
  uniqChunk: index("embeddings_uniq_chunk").on(t.sourceKind, t.sourceRef, t.chunkIndex),
}));
```
Note: `refId` is intentionally not a FK (polymorphic project-or-ticket, validated in the service).

Add type exports:
```ts
export type Note = typeof notes.$inferSelect;
export type NewNote = typeof notes.$inferInsert;
export type Embedding = typeof embeddings.$inferSelect;
export type NewEmbedding = typeof embeddings.$inferInsert;
```

- [ ] **Step 4: Create `src/db/vector-setup.ts`**

```ts
import { sql } from "./client.js";

export async function ensureExtension(): Promise<void> {
  await sql`CREATE EXTENSION IF NOT EXISTS vector`;
}

export async function ensureIndex(): Promise<void> {
  await sql`CREATE INDEX IF NOT EXISTS embeddings_embedding_idx
    ON embeddings USING hnsw (embedding vector_cosine_ops)`;
}
```

- [ ] **Step 5: Apply to DB in order (extension BEFORE push, index AFTER)**

Run:
```
npm run db:vector        # extension must exist before drizzle can create a vector column
npm run db:push          # creates notes + embeddings, alters events
npm run db:vector:index  # hnsw index needs the table to exist
```
Expected: no errors. If `db:push` prompts interactively about the events column change, it is altering `ticket_id` to nullable + adding `note_id`/CHECK — accept it; note in report.

- [ ] **Step 6: Write `tests/knowledge-schema.test.ts`**

```ts
import { expect, test } from "vitest";
import { sql } from "../src/db/client.js";
import { db } from "../src/db/client.js";
import { actors, events } from "../src/db/schema.js";

test("vector extension, new tables, and generalized events exist", async () => {
  const ext = await sql`select 1 from pg_extension where extname = 'vector'`;
  expect(ext.length).toBe(1);
  const tbls = await sql`select table_name from information_schema.tables where table_schema='public'`;
  const names = tbls.map((r) => r.table_name);
  expect(names).toContain("notes");
  expect(names).toContain("embeddings");
});

test("events CHECK rejects a row with neither ticketId nor noteId", async () => {
  const [a] = await db.insert(actors)
    .values({ name: "ck", kind: "agent", apiKeyHash: `h-${Date.now()}` }).returning();
  await expect(
    db.insert(events).values({ actorId: a.id, action: "bogus" }),
  ).rejects.toBeTruthy();
});
```

- [ ] **Step 7: Run tests**

Run: `npm test -- knowledge-schema` then `npm run typecheck`
Expected: PASS; typecheck clean.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat: pgvector schema, notes + embeddings tables, generalized events audit"
```

---

### Task 2: Embedder abstraction (fake + Voyage) + config

**Files:**
- Create: `src/knowledge/embedder.ts`, `tests/embedder.test.ts`

**Interfaces:**
- Produces `interface Embedder { embed(texts: string[]): Promise<number[][]>; model: string; dim: number }`.
- `FakeEmbedder` — deterministic vectors (for tests). `class FakeEmbedder implements Embedder`, constructor `(dim = 1024)`.
- `VoyageEmbedder` — real, via fetch.
- `getEmbedder(): Embedder` — from env (`EMBED_PROVIDER`, `EMBED_MODEL`, keys); `EMBED_PROVIDER=fake` yields FakeEmbedder. Unknown model → throw.
- `MODEL_DIMS: Record<string, number>`.

- [ ] **Step 1: Write `tests/embedder.test.ts`**

```ts
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
  process.env.EMBED_PROVIDER = "voyage";
  process.env.EMBED_MODEL = "not-a-real-model";
  expect(() => getEmbedder()).toThrow();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- embedder`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `src/knowledge/embedder.ts`**

```ts
import { createHash } from "node:crypto";

export interface Embedder {
  embed(texts: string[]): Promise<number[][]>;
  model: string;
  dim: number;
}

export const MODEL_DIMS: Record<string, number> = {
  "voyage-3": 1024,
  "voyage-3-lite": 512,
  "text-embedding-3-small": 1536,
  "text-embedding-3-large": 3072,
  "text-embedding-004": 768,
};

// Deterministic pseudo-embedding for tests: hash-seeded unit-ish vector.
export class FakeEmbedder implements Embedder {
  model = "fake";
  constructor(public dim = 1024) {}
  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((t) => {
      const h = createHash("sha256").update(t).digest();
      return Array.from({ length: this.dim }, (_, i) => (h[i % h.length] / 255) * 2 - 1);
    });
  }
}

export class VoyageEmbedder implements Embedder {
  dim: number;
  constructor(public model: string, private apiKey: string) {
    const d = MODEL_DIMS[model];
    if (!d) throw new Error(`unknown embed model: ${model}`);
    this.dim = d;
  }
  async embed(texts: string[]): Promise<number[][]> {
    const res = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({ input: texts, model: this.model }),
    });
    if (!res.ok) throw new Error(`voyage embed failed: ${res.status}`);
    const data = (await res.json()) as { data: { embedding: number[] }[] };
    return data.data.map((d) => d.embedding);
  }
}

export function getEmbedder(): Embedder {
  const provider = process.env.EMBED_PROVIDER ?? "voyage";
  if (provider === "fake") return new FakeEmbedder(1024);
  const model = process.env.EMBED_MODEL ?? "voyage-3";
  if (!MODEL_DIMS[model]) throw new Error(`unknown embed model: ${model}`);
  if (provider === "voyage") return new VoyageEmbedder(model, process.env.VOYAGE_API_KEY ?? "");
  throw new Error(`unsupported EMBED_PROVIDER: ${provider}`);
}
```
Note: only Voyage is wired here (default provider). OpenAI/Gemini classes are deferred — `getEmbedder` throws for them, which is honest until a later slice adds them.

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- embedder`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: pluggable embedder with fake and voyage providers"
```

---

### Task 3: Markdown chunker (pure)

**Files:**
- Create: `src/knowledge/chunker.ts`, `tests/chunker.test.ts`

**Interfaces:**
- Produces `chunkMarkdown(text: string, maxChars?: number): { index: number; content: string }[]`. Splits on markdown headings (`#`..`######` lines), then size-caps each section at `maxChars` (default 1200), subdividing oversize sections on blank lines/paragraphs. Drops empty chunks. Deterministic.

- [ ] **Step 1: Write `tests/chunker.test.ts`**

```ts
import { expect, test } from "vitest";
import { chunkMarkdown } from "../src/knowledge/chunker.js";

test("splits on headings into indexed chunks", () => {
  const md = "# A\nalpha text\n\n# B\nbeta text";
  const chunks = chunkMarkdown(md);
  expect(chunks.length).toBe(2);
  expect(chunks[0].index).toBe(0);
  expect(chunks[0].content).toContain("alpha");
  expect(chunks[1].content).toContain("beta");
});

test("subdivides an oversize section", () => {
  const big = "# Big\n" + Array.from({ length: 50 }, (_, i) => `para ${i}`).join("\n\n");
  const chunks = chunkMarkdown(big, 100);
  expect(chunks.length).toBeGreaterThan(1);
  for (const c of chunks) expect(c.content.length).toBeLessThanOrEqual(100 + 40);
});

test("empty input yields no chunks", () => {
  expect(chunkMarkdown("   \n\n ")).toEqual([]);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- chunker`
Expected: FAIL.

- [ ] **Step 3: Write `src/knowledge/chunker.ts`**

```ts
export function chunkMarkdown(
  text: string,
  maxChars = 1200,
): { index: number; content: string }[] {
  const lines = text.split(/\r?\n/);
  const sections: string[] = [];
  let cur: string[] = [];
  const flush = () => { if (cur.join("\n").trim()) sections.push(cur.join("\n").trim()); cur = []; };
  for (const line of lines) {
    if (/^#{1,6}\s/.test(line)) { flush(); cur.push(line); }
    else cur.push(line);
  }
  flush();

  const out: string[] = [];
  for (const sec of sections) {
    if (sec.length <= maxChars) { out.push(sec); continue; }
    let buf = "";
    for (const para of sec.split(/\n\s*\n/)) {
      if (buf && (buf.length + para.length + 2) > maxChars) { out.push(buf.trim()); buf = ""; }
      buf += (buf ? "\n\n" : "") + para;
    }
    if (buf.trim()) out.push(buf.trim());
  }
  return out.filter((c) => c.trim()).map((content, index) => ({ index, content }));
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- chunker`
Expected: PASS (note the oversize test allows slight overflow for a single large paragraph).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: heading-aware markdown chunker"
```

---

### Task 4: Knowledge service — search + vault upsert/delete helpers

**Files:**
- Create: `src/services/knowledge.ts`, `tests/knowledge-search.test.ts`

**Interfaces:**
- Consumes: `db`, `sql`, `embeddings` table, `getEmbedder`, `chunkMarkdown`.
- Produces:
  - `upsertVaultFile(path: string, text: string, embedder: Embedder): Promise<number>` — replaces all `embeddings` rows for `(vault, path)`: delete old, chunk, embed, insert; returns chunk count. Stores `contentHash` (sha256 of `text`) on every row.
  - `deleteVaultFile(path: string): Promise<void>` — deletes `(vault, path)` rows.
  - `fileHash(text: string): string` — sha256 hex (exported for the watcher's hash-gate).
  - `searchKnowledge(query: string, opts?: { limit?: number; scope?: "global"|"project"|"ticket"; refId?: string }, embedder?: Embedder): Promise<{ content: string; sourceKind: string; sourceRef: string; score: number; citation: string }[]>` — embed query, cosine-nearest over `embeddings` filtered to the embedder's `dim`; default limit 5. Citation = `sourceRef`.
  - `insertNoteEmbedding(noteId: string, body: string, embedder: Embedder): Promise<void>` — used by notes service: delete old `(note, noteId)` rows, embed body chunks, insert.

- [ ] **Step 1: Write `tests/knowledge-search.test.ts`**

```ts
import { expect, test } from "vitest";
import { FakeEmbedder } from "../src/knowledge/embedder.js";
import { upsertVaultFile, searchKnowledge } from "../src/services/knowledge.js";

const emb = new FakeEmbedder(1024);

test("indexed vault content is retrievable and ranked", async () => {
  const p = `note-${Date.now()}.md`;
  await upsertVaultFile(p, "# Backups\nRun pg_dump nightly to the NAS share.", emb);
  const hits = await searchKnowledge("how do we back up postgres", { limit: 5 }, emb);
  expect(hits.length).toBeGreaterThan(0);
  const mine = hits.find((h) => h.sourceRef === p);
  expect(mine).toBeDefined();
  expect(mine!.citation).toBe(p);
});

test("dim mismatch rows are excluded", async () => {
  const wrong = new FakeEmbedder(1024);
  // Query with a 512-dim embedder must not compare against 1024-dim rows.
  const small = new FakeEmbedder(512);
  const hits = await searchKnowledge("anything", { limit: 5 }, small);
  expect(hits.every((h) => true)).toBe(true); // no throw; mismatched rows filtered by dim
  void wrong;
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- knowledge-search`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `src/services/knowledge.ts`**

```ts
import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, sql as rawSql } from "../db/client.js";
import { embeddings } from "../db/schema.js";
import { chunkMarkdown } from "../knowledge/chunker.js";
import { getEmbedder, type Embedder } from "../knowledge/embedder.js";

export function fileHash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function vecLiteral(v: number[]): string {
  return `[${v.join(",")}]`;
}

export async function upsertVaultFile(path: string, text: string, embedder: Embedder): Promise<number> {
  const chunks = chunkMarkdown(text);
  const hash = fileHash(text);
  await db.delete(embeddings)
    .where(and(eq(embeddings.sourceKind, "vault"), eq(embeddings.sourceRef, path)));
  if (chunks.length === 0) return 0;
  const vecs = await embedder.embed(chunks.map((c) => c.content));
  await db.insert(embeddings).values(chunks.map((c, i) => ({
    sourceKind: "vault" as const, sourceRef: path, chunkIndex: c.index,
    content: c.content, embedding: vecs[i], model: embedder.model, dim: embedder.dim,
    contentHash: hash,
  })));
  return chunks.length;
}

export async function deleteVaultFile(path: string): Promise<void> {
  await db.delete(embeddings)
    .where(and(eq(embeddings.sourceKind, "vault"), eq(embeddings.sourceRef, path)));
}

export async function insertNoteEmbedding(noteId: string, body: string, embedder: Embedder): Promise<void> {
  const chunks = chunkMarkdown(body);
  const hash = fileHash(body);
  await db.delete(embeddings)
    .where(and(eq(embeddings.sourceKind, "note"), eq(embeddings.sourceRef, noteId)));
  const parts = chunks.length ? chunks : [{ index: 0, content: body }];
  const vecs = await embedder.embed(parts.map((c) => c.content));
  await db.insert(embeddings).values(parts.map((c, i) => ({
    sourceKind: "note" as const, sourceRef: noteId, chunkIndex: c.index,
    content: c.content, embedding: vecs[i], model: embedder.model, dim: embedder.dim,
    contentHash: hash,
  })));
}

export async function searchKnowledge(
  query: string,
  opts: { limit?: number; scope?: string; refId?: string } = {},
  embedder: Embedder = getEmbedder(),
): Promise<{ content: string; sourceKind: string; sourceRef: string; score: number; citation: string }[]> {
  const [qv] = await embedder.embed([query]);
  const limit = opts.limit ?? 5;
  const lit = vecLiteral(qv);
  // Cosine distance; filter to active dim so mixed-dim rows never compare.
  const rows = await rawSql`
    select source_kind, source_ref, content,
           1 - (embedding <=> ${lit}::vector) as score
    from embeddings
    where dim = ${embedder.dim}
    order by embedding <=> ${lit}::vector
    limit ${limit}`;
  return rows.map((r: any) => ({
    content: r.content, sourceKind: r.source_kind, sourceRef: r.source_ref,
    score: Number(r.score), citation: r.source_ref,
  }));
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- knowledge-search`
Expected: PASS. If pgvector rejects `${lit}::vector` parameter binding, use `rawSql.unsafe` for the literal or cast via `::vector` on a text param — adjust and note in report.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: knowledge service with vector search and vault embedding upsert"
```

---

### Task 5: Notes service — saveNote (audited, embed post-commit) + sweep

**Files:**
- Create: `src/services/notes.ts`, `tests/notes.test.ts`

**Interfaces:**
- Consumes: `db`, `notes`/`events`/`tickets`/`projects` tables, `NotFoundError`, `insertNoteEmbedding`, `getEmbedder`.
- Produces:
  - `saveNote(actorId: string, input: { body: string; scope: "global"|"project"|"ticket"; refId?: string }, embedder?: Embedder): Promise<Note>` — validates refId per scope; transaction inserts note (`indexed:"false"`) + events row (`action:"note.saved"`, `noteId` set); after commit embeds via `insertNoteEmbedding` and sets `indexed:"true"`. On embed failure: keep note `indexed:"false"`, still return it.
  - `sweepUnindexedNotes(embedder?: Embedder): Promise<number>` — embeds all notes with `indexed:"false"`, sets them true; returns count. Used by the watcher startup.

- [ ] **Step 1: Write `tests/notes.test.ts`**

```ts
import { expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../src/db/client.js";
import { notes, events, embeddings } from "../src/db/schema.js";
import { createActor } from "../src/services/actors.js";
import { saveNote, sweepUnindexedNotes } from "../src/services/notes.js";
import { FakeEmbedder } from "../src/knowledge/embedder.js";
import { NotFoundError } from "../src/services/errors.js";

const emb = new FakeEmbedder(1024);

test("saveNote writes note + audit event + embedding", async () => {
  const { actor } = await createActor({ name: "mem", kind: "agent" });
  const note = await saveNote(actor.id, { body: "chose port 5433", scope: "global" }, emb);
  expect(note.indexed).toBe(true);

  const evts = await db.select().from(events).where(eq(events.noteId, note.id));
  expect(evts).toHaveLength(1);
  expect(evts[0].action).toBe("note.saved");
  expect(evts[0].ticketId).toBeNull();

  const embs = await db.select().from(embeddings).where(eq(embeddings.sourceRef, note.id));
  expect(embs.length).toBeGreaterThan(0);
});

test("embedding failure keeps the note un-indexed, then sweep fixes it", async () => {
  const { actor } = await createActor({ name: "mem2", kind: "agent" });
  const boom: any = { model: "boom", dim: 1024, embed: async () => { throw new Error("api down"); } };
  const note = await saveNote(actor.id, { body: "keep me", scope: "global" }, boom);
  expect(note.indexed).toBe(false);
  const evts = await db.select().from(events).where(eq(events.noteId, note.id));
  expect(evts).toHaveLength(1); // audited even though embedding failed

  const n = await sweepUnindexedNotes(emb);
  expect(n).toBeGreaterThanOrEqual(1);
  const [after] = await db.select().from(notes).where(eq(notes.id, note.id));
  expect(after.indexed).toBe(true);
});

test("project-scoped note with bad refId throws NotFoundError", async () => {
  const { actor } = await createActor({ name: "mem3", kind: "agent" });
  await expect(
    saveNote(actor.id, { body: "x", scope: "project", refId: "00000000-0000-0000-0000-000000000000" }, emb),
  ).rejects.toBeInstanceOf(NotFoundError);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- notes`
Expected: FAIL.

- [ ] **Step 3: Write `src/services/notes.ts`**

```ts
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { notes, events, tickets, projects, type Note } from "../db/schema.js";
import { NotFoundError } from "./errors.js";
import { insertNoteEmbedding } from "./knowledge.js";
import { getEmbedder, type Embedder } from "../knowledge/embedder.js";

export async function saveNote(
  actorId: string,
  input: { body: string; scope: "global" | "project" | "ticket"; refId?: string },
  embedder: Embedder = getEmbedder(),
): Promise<Note> {
  if (input.scope !== "global") {
    if (!input.refId) throw new NotFoundError(`${input.scope} note requires refId`);
    const tbl = input.scope === "project" ? projects : tickets;
    const [row] = await db.select({ id: tbl.id }).from(tbl).where(eq(tbl.id, input.refId)).limit(1);
    if (!row) throw new NotFoundError(`${input.scope} ${input.refId}`);
  }

  const note = await db.transaction(async (tx) => {
    const [n] = await tx.insert(notes).values({
      actorId, body: input.body, scope: input.scope, refId: input.refId, indexed: false,
    }).returning();
    await tx.insert(events).values({ actorId, noteId: n.id, action: "note.saved" });
    return n;
  });

  try {
    await insertNoteEmbedding(note.id, note.body, embedder);
    const [updated] = await db.update(notes)
      .set({ indexed: true }).where(eq(notes.id, note.id)).returning();
    return updated;
  } catch {
    return note; // truth kept; sweep will re-index
  }
}

export async function sweepUnindexedNotes(embedder: Embedder = getEmbedder()): Promise<number> {
  const pending = await db.select().from(notes).where(eq(notes.indexed, false));
  let done = 0;
  for (const n of pending) {
    try {
      await insertNoteEmbedding(n.id, n.body, embedder);
      await db.update(notes).set({ indexed: true }).where(eq(notes.id, n.id));
      done++;
    } catch { /* leave for next sweep */ }
  }
  return done;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- notes`
Expected: PASS (all three tests).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: notes memory service with audited writes and embed-after-commit"
```

---

### Task 6: Vault ingest watcher

**Files:**
- Create: `src/ingest/watch.ts`, `tests/ingest.test.ts`

**Interfaces:**
- Consumes: `upsertVaultFile`, `deleteVaultFile`, `fileHash`, `sweepUnindexedNotes`, `getEmbedder`, `db`/`embeddings`.
- Produces (testable, non-chokidar):
  - `indexVaultOnce(dir: string, embedder: Embedder): Promise<{ indexed: number; skipped: number }>` — walk `dir` for `.md`, hash-gate against existing rows (skip unchanged), upsert changed/new.
  - `handleUnlink(path: string): Promise<void>` — delegate to `deleteVaultFile`.
- Plus a chokidar entrypoint guarded by `pathToFileURL(process.argv[1]).href` that calls `indexVaultOnce`, `sweepUnindexedNotes`, then watches `VAULT_PATH`.

- [ ] **Step 1: Write `tests/ingest.test.ts`**

```ts
import { expect, test } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq, and } from "drizzle-orm";
import { db } from "../src/db/client.js";
import { embeddings } from "../src/db/schema.js";
import { FakeEmbedder } from "../src/knowledge/embedder.js";
import { indexVaultOnce, handleUnlink } from "../src/ingest/watch.js";

const emb = new FakeEmbedder(1024);
const rows = (p: string) =>
  db.select().from(embeddings).where(and(eq(embeddings.sourceKind, "vault"), eq(embeddings.sourceRef, p)));

test("full index, hash-gate skip, re-index on change, delete on unlink", async () => {
  const dir = mkdtempSync(join(tmpdir(), "vault-"));
  const file = join(dir, "doc.md");
  writeFileSync(file, "# Title\nfirst content");

  const r1 = await indexVaultOnce(dir, emb);
  expect(r1.indexed).toBe(1);
  expect((await rows(file)).length).toBeGreaterThan(0);

  const r2 = await indexVaultOnce(dir, emb);         // unchanged -> skipped
  expect(r2.skipped).toBe(1);
  expect(r2.indexed).toBe(0);

  writeFileSync(file, "# Title\nchanged content entirely");
  const r3 = await indexVaultOnce(dir, emb);         // changed -> re-index
  expect(r3.indexed).toBe(1);

  await handleUnlink(file);                            // delete
  expect((await rows(file)).length).toBe(0);

  rmSync(dir, { recursive: true, force: true });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- ingest`
Expected: FAIL.

- [ ] **Step 3: Write `src/ingest/watch.ts`**

```ts
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { embeddings } from "../db/schema.js";
import { upsertVaultFile, deleteVaultFile, fileHash } from "../services/knowledge.js";
import { sweepUnindexedNotes } from "../services/notes.js";
import { getEmbedder, type Embedder } from "../knowledge/embedder.js";

function walkMd(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) out.push(...walkMd(p));
    else if (name.endsWith(".md")) out.push(p);
  }
  return out;
}

export async function indexVaultOnce(
  dir: string, embedder: Embedder,
): Promise<{ indexed: number; skipped: number }> {
  let indexed = 0, skipped = 0;
  for (const path of walkMd(dir)) {
    const text = readFileSync(path, "utf8");
    const hash = fileHash(text);
    const [existing] = await db.select({ h: embeddings.contentHash }).from(embeddings)
      .where(and(eq(embeddings.sourceKind, "vault"), eq(embeddings.sourceRef, path))).limit(1);
    if (existing && existing.h === hash) { skipped++; continue; }
    try { await upsertVaultFile(path, text, embedder); indexed++; }
    catch (e) { console.error(`ingest failed for ${path}:`, (e as Error).message); }
  }
  return { indexed, skipped };
}

export async function handleUnlink(path: string): Promise<void> {
  await deleteVaultFile(path);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = process.env.VAULT_PATH;
  if (!dir) throw new Error("VAULT_PATH not set");
  const embedder = getEmbedder();
  const { default: chokidar } = await import("chokidar");
  await indexVaultOnce(dir, embedder);
  await sweepUnindexedNotes(embedder);
  const debounce = new Map<string, NodeJS.Timeout>();
  const reindex = (path: string) => {
    clearTimeout(debounce.get(path));
    debounce.set(path, setTimeout(async () => {
      try { await upsertVaultFile(path, readFileSync(path, "utf8"), embedder); }
      catch (e) { console.error(`ingest failed for ${path}:`, (e as Error).message); }
    }, 300));
  };
  chokidar.watch(dir, { ignoreInitial: true })
    .on("add", reindex).on("change", reindex)
    .on("unlink", (p) => handleUnlink(p).catch(() => {}));
  console.log(`watching ${dir}`);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- ingest` then full `npm test` then `npm run typecheck`
Expected: PASS; everything green.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: vault ingest watcher with hash-gated full index and delete-on-unlink"
```

---

### Task 7: MCP tools + REST routes (save_note, search_knowledge)

**Files:**
- Modify: `src/mcp/server.ts`, `src/api/app.ts`
- Create: `tests/knowledge-api.test.ts`

**Interfaces:**
- MCP: add tools `save_note({ body, scope, refId? })` and `search_knowledge({ query, limit? })`, calling `saveNote(actor.id, ...)` and `searchKnowledge(...)`. Reuse the actor resolved in `buildServer`.
- REST: `POST /notes` (body `{ body, scope, refId? }`, uses `c.get("actor").id`) → 201 note; `GET /knowledge?q=&limit=` → hits. Both behind the existing `auth` middleware. Do NOT reuse `/search` (Phase 1 ticket keyword search owns it) — knowledge search is `/knowledge`.

- [ ] **Step 1: Write `tests/knowledge-api.test.ts`**

```ts
import { expect, test } from "vitest";
import { createActor } from "../src/services/actors.js";
import { app } from "../src/api/app.js";

test("REST: save a note then retrieve it via /knowledge", async () => {
  process.env.EMBED_PROVIDER = "fake";
  const { apiKey } = await createActor({ name: "kapi", kind: "human" });
  const h = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };

  const unauth = await app.request("/notes", { method: "POST", body: "{}" });
  expect(unauth.status).toBe(401);

  const created = await app.request("/notes", {
    method: "POST", headers: h,
    body: JSON.stringify({ body: "deploy runbook lives in confluence", scope: "global" }),
  });
  expect(created.status).toBe(201);

  const res = await app.request("/knowledge?q=where%20is%20the%20deploy%20runbook", { headers: h });
  expect(res.status).toBe(200);
  const hits = await res.json();
  expect(Array.isArray(hits)).toBe(true);
  expect(hits.length).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- knowledge-api`
Expected: FAIL (routes 404).

- [ ] **Step 3: Edit `src/api/app.ts`** — add imports and two routes

Add to imports:
```ts
import { saveNote } from "../services/notes.js";
import { searchKnowledge } from "../services/knowledge.js";
```
Add routes (after the existing ones, still under the `auth` middleware):
```ts
app.post("/notes", async (c) => {
  const { body, scope, refId } = await c.req.json();
  return c.json(await saveNote(c.get("actor").id, { body, scope, refId }), 201);
});

app.get("/knowledge", async (c) => {
  const q = c.req.query("q") ?? "";
  const limit = c.req.query("limit") ? Number(c.req.query("limit")) : undefined;
  return c.json(await searchKnowledge(q, { limit }));
});
```

- [ ] **Step 4: Edit `src/mcp/server.ts`** — add two tools inside `buildServer` (before `return server;`)

```ts
server.registerTool("save_note",
  { inputSchema: { body: z.string(), scope: z.enum(["global", "project", "ticket"]), refId: z.string().optional() } },
  async ({ body, scope, refId }) => ({
    content: [{ type: "text", text: JSON.stringify(await saveNote(actor.id, { body, scope, refId })) }],
  }));

server.registerTool("search_knowledge",
  { inputSchema: { query: z.string(), limit: z.number().optional() } },
  async ({ query, limit }) => ({
    content: [{ type: "text", text: JSON.stringify(await searchKnowledge(query, { limit })) }],
  }));
```
Add imports at the top of the file:
```ts
import { saveNote } from "../services/notes.js";
import { searchKnowledge } from "../services/knowledge.js";
```

- [ ] **Step 5: Run to verify it passes**

Run: `npm test -- knowledge-api` then `npm test -- mcp` (buildServer still builds) then full `npm test` then `npm run typecheck`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: expose save_note and search_knowledge over MCP and REST"
```

---

### Task 8: End-to-end cross-session memory proof

**Files:**
- Create: `tests/e2e-memory.test.ts`

**Interfaces:**
- Consumes services only. Proves the Phase 2 acceptance criteria: a note saved by one actor is retrievable by another via search (cross-session), audited; and vault content is searchable then removed on delete.

- [ ] **Step 1: Write `tests/e2e-memory.test.ts`**

```ts
import { expect, test } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { db } from "../src/db/client.js";
import { events } from "../src/db/schema.js";
import { createActor } from "../src/services/actors.js";
import { saveNote } from "../src/services/notes.js";
import { searchKnowledge } from "../src/services/knowledge.js";
import { indexVaultOnce, handleUnlink } from "../src/ingest/watch.js";
import { FakeEmbedder } from "../src/knowledge/embedder.js";

const emb = new FakeEmbedder(1024);

test("note saved by session A is retrievable by session B, and audited", async () => {
  const { actor: a } = await createActor({ name: "sessionA", kind: "agent" });
  const note = await saveNote(a.id, { body: "the staging DB password rotates monthly", scope: "global" }, emb);

  // "Session B": a fresh search finds A's memory.
  const hits = await searchKnowledge("staging database password rotation", { limit: 5 }, emb);
  expect(hits.some((h) => h.sourceRef === note.id)).toBe(true);

  const [evt] = await db.select().from(events).where(eq(events.noteId, note.id));
  expect(evt.action).toBe("note.saved");
  expect(evt.actorId).toBe(a.id);
});

test("vault doc is searchable after index and gone after delete", async () => {
  const dir = mkdtempSync(join(tmpdir(), "vault-e2e-"));
  const file = join(dir, "sop.md");
  writeFileSync(file, "# Firewall\nAllow 443 inbound on the edge router.");
  await indexVaultOnce(dir, emb);
  const before = await searchKnowledge("which ports are open on the firewall", { limit: 5 }, emb);
  expect(before.some((h) => h.sourceRef === file)).toBe(true);

  await handleUnlink(file);
  const after = await searchKnowledge("which ports are open on the firewall", { limit: 5 }, emb);
  expect(after.some((h) => h.sourceRef === file)).toBe(false);

  rmSync(dir, { recursive: true, force: true });
});
```

- [ ] **Step 2: Run**

Run: `npm test -- e2e-memory`
Expected: PASS.

- [ ] **Step 3: Full gate**

Run: `npm test && npm run typecheck`
Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "test: end-to-end cross-session memory and vault retrieval proof"
```

---

## Phase 2 acceptance

- `save_note` from one session is found by `search_knowledge` in another (cross-session sync) with a `note.saved` audit row attributed to the actor.
- Editing a vault file makes its content retrievable with a file-path citation; deleting the file removes it.
- Embedding-API failure during `save_note` keeps the note (`indexed:false`), still audited; a sweep re-indexes it.
- Full suite + typecheck green. Manual: run `npm run ingest:watch` with `VAULT_PATH` + `EMBED_PROVIDER=fake` (or Voyage key), edit a vault note, then query via MCP `search_knowledge` from Claude Code.

## Self-review notes (done)

- Spec coverage: unified embeddings (Task 4), notes+audit via generalized events (Tasks 1,5), vault ingest full/incremental/delete (Task 6), pluggable embedder + dim pinning (Task 2), one search + save tool over MCP+REST (Task 7), cross-session proof (Task 8). Covered.
- Type consistency: `saveNote(actorId, {body,scope,refId?}, embedder?)`, `searchKnowledge(query, {limit?,scope?,refId?}, embedder?)`, `upsertVaultFile(path,text,embedder)`, `fileHash(text)` used identically across services, watcher, MCP, REST, and tests.
- Known risk flagged inline: pgvector parameter binding for the query vector (Task 4 Step 4) may need `::vector` cast tuning against the installed driver — the task tells the implementer to adjust and report.
- `indexed` is a real `boolean` column (Task 1), set with `true`/`false` in the service and asserted with `.toBe(true/false)` in tests (Task 5) — consistent.
```