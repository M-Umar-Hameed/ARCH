# Standalone v1 — Embedded PGlite DB + Auto-Bootstrap (Design Spec)

## Context

VibeOps (this repo) currently requires Docker (Postgres+pgvector), a hand-run bootstrap script for the first actor/project/API key, and manual settings entry in the desktop app. That makes it a developer stack, not a standalone app a vibecoder can install and use. This slice removes the two biggest walls: the external database and the manual first-run setup.

Evaluated and rejected for this goal: pulp-platform/dory (embedded-ML compiler, irrelevant), Augani/dory (macOS-only Docker alternative — right diagnosis, wrong fix: we remove Docker instead), dorylab/dory (SQL client — companion tool at most), allenai/olmocr (GPU-class OCR — our PDF parser already has hybrid OCR).

## Scope of this slice (decided during brainstorming)

- **A. Embedded DB:** PGlite (`@electric-sql/pglite`, Postgres-in-WASM with a pgvector extension and an official Drizzle driver) becomes the default database. Dual-mode: `DATABASE_URL` set → existing postgres-js path unchanged (tests, power users, VPS).
- **C. Auto-bootstrap:** first run on the embedded DB self-creates a default project + admin actor, writes credentials to `.vibeops`, and the desktop app auto-detects them.
- Out of scope (later slices): sidecar/installer (B), local zero-key embeddings (D), one-click MCP config (E), auto-updater/tray (F), in-app data console.

## `.vibeops` home

```
C:\Users\<user>\.vibeops\
  data\               PGlite database files (delete = factory reset)
  credentials.json    { "baseUrl": "http://localhost:8787", "apiKey": "<plaintext>" }  — written once on first run
```

The plaintext key lives only here (trust level of `~/.ssh`); the DB stores only the sha256 hash, unchanged.

## Architecture

### DB seam (`src/db/client.ts`)
- `DATABASE_URL` set → postgres-js + drizzle, byte-identical to today.
- Not set → PGlite: data dir `~/.vibeops/data`, vector extension loaded natively (`@electric-sql/pglite/vector`), `drizzle-orm/pglite` driver.
- The exported `db` is the single seam; all services stay driver-agnostic.

### Raw-SQL refactor (required by the seam)
`searchKnowledge` (`src/services/knowledge.ts`) and `src/db/vector-setup.ts` currently use the raw postgres-js `sql` client. They move to Drizzle's driver-agnostic ``sql`` template (`db.execute(sql`...`)`), so one query path serves both drivers. The cosine query keeps its parameterized `::vector` cast and `dim` filter. `vector-setup`'s `ensureExtension` becomes a no-op under PGlite (extension loads natively); `ensureIndex` attempts HNSW and tolerates failure (see Risks).

### Migrations (embedded mode)
`drizzle-kit generate` produces SQL migrations committed to the repo; on embedded boot, `migrate()` runs them programmatically before anything else. External mode keeps the existing `db:vector` → `db:push` → `db:vector:index` workflow. Going forward, migrations are additive-only (embedded DBs in the wild cannot be hand-fixed).

### Auto-bootstrap (`src/bootstrap.ts`, embedded mode only)
After migrations, if `actors` is empty → first run:
1. `createProject({ key: "inbox", name: "Inbox" })`.
2. `createActor({ name: "owner", kind: "human", role: "admin" })`.
3. Write `~/.vibeops/credentials.json` with baseUrl (`http://localhost:<PORT>`) + the plaintext key.
Idempotent (actors exist → skip). External-DB mode: bootstrap OFF (a shared server must not self-mint admin keys); log a hint instead.

### App: local-node detection
- New dep `@tauri-apps/plugin-fs` + Rust registration + a capability scoped to exactly `$HOME/.vibeops/*` (not broad fs).
- Settings gains "Detect local node": read `credentials.json`, fill baseUrl+key, test (`projects.list`), save via the existing settings store.
- The first-run gate attempts detection automatically before showing Settings; the screen only appears if detection fails. The user's existing tabbed Settings UI owns the presentation.

## Error handling

- PGlite boot failure (corrupt dir) → startup error naming `~/.vibeops/data`; deleting it is the documented factory reset.
- credentials.json unreadable/absent in the app → fall through to manual Settings (no crash).
- HNSW index creation failure under PGlite → warn once, continue unindexed (sequential scan is fine at standalone scale).
- Bootstrap write failure (e.g. locked file) → server still runs; key printed to console as fallback.

## Testing

- Existing 39 server tests keep running against real Postgres 5433 (stronger than testing the WASM emulation) — untouched.
- New: embedded-boot test (PGlite in a temp dir → migrate → createTicket + saveNote + searchKnowledge round-trip; proves schema + vector path under WASM). Bootstrap idempotency (runs once, second boot skips, exactly one owner actor). credentials.json shape.
- App: detect-local-node unit test with mocked fs read (fills + saves settings).

## Acceptance

- With Docker stopped and no `DATABASE_URL`: `npm run dev` boots, migrates, bootstraps, writes `~/.vibeops/credentials.json`; the app's first run auto-connects (no manual URL/key entry); create ticket + knowledge search work end-to-end on the embedded DB.
- With `DATABASE_URL` set: identical behavior to today; full existing suite green.
- Second boot: no duplicate bootstrap.

## Risks / notes

- **HNSW under PGlite** unverified — the design tolerates its absence (unindexed vector search); the plan must probe and not fail boot.
- **PGlite is single-process** (one connection): fine for the standalone case (one server process); concurrent external tools should use external mode.
- Tauri identifier is still scaffold `com.admin.app`; renaming to `com.vibeops.app` moves the plugin-store path — do it in this slice while nothing ships.

## Deferred
- B sidecar + installer, D local embeddings, E one-click MCP config, F updater/tray, data console.
