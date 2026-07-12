# Session-Transcript Memory (Design Spec)

## Context

Work done in one AI tool is invisible to the others: a Claude Code session ends, the user continues in Gemini, and Gemini knows nothing. A machine-local claude-mem wiring solved this once but died with a Windows reinstall. This slice ingests session history into VibeOps's durable knowledge store, so every MCP-connected tool shares one queryable cross-tool memory via the existing `search_knowledge` — backed up with `~/.vibeops`, rebuildable from surviving logs after a reinstall.

Machine survey (verified): claude-mem SQLite store at `~/.claude-mem/claude-mem.db` with an `observations` table (1068 rows; structured title/narrative/facts/concepts per row) — highest signal per effort. Claude Code raw transcripts: 276 `.jsonl` files under `~/.claude/projects/<project>/`. Codex absent on this machine; Gemini/Antigravity have no verified transcript store (Antigravity's `brain` dir noted for a later connector).

## Scope of this slice (decided during brainstorming)

- Sources: **claude-mem observations DB + Claude Code transcript jsonl** — the two that verifiably exist. Gemini / Antigravity / Codex / local-LLM = later `SessionSource` implementations once formats are verified.
- Ingestion: rerunnable CLI (`npm run ingest:sessions`), hash-gated, default window = last **30 days** (`SESSIONS_SINCE_DAYS` env to widen; full history = slow first run + index bloat).
- Retrieval: **zero changes** — session chunks surface through the existing `search_knowledge` with their ref as citation.
- Out of scope: other tools' connectors, live watching of session dirs (rerun/cron is enough for history), secret redaction (documented risk; user/assistant-only filter reduces it), deletion mirroring (history is append-only), summarization of raw transcripts.

## Architecture

```
src/ingest/sessions/
  source.ts        SessionSource interface + SessionDoc type
  claude-mem.ts    reader: observations DB via node:sqlite (read-only)
  claude-code.ts   reader: ~/.claude/projects/**/*.jsonl
  cli.ts           npm run ingest:sessions
```

```ts
export type SessionDoc = { ref: string; text: string; hash: string };
export interface SessionSource {
  source: string;                       // "claude-mem", "claude-code", later "gemini"...
  listSessionDocs(sinceDays: number): Promise<SessionDoc[]>;
}
```

### Readers
- **claude-mem**: open `~/.claude-mem/claude-mem.db` read-only via `node:sqlite` (`DatabaseSync`, built into Node 22+ — no new dependency). One doc per `observations` row within the window: `ref = "claude-mem#<id>"`, text = title + narrative + facts + concepts (+ project), `hash` = sha256 of that text. DB absent → source skipped silently. DB locked/corrupt → one warning, source skipped (claude-mem may be writing; next run catches up).
- **claude-code**: walk `~/.claude/projects/**/*.jsonl`, filter by file mtime within the window. Per file: parse each line, keep ONLY user/assistant message text (string content or text parts of content arrays); skip tool_use/tool_result/queue/progress noise — signal cleanup and secret-leak reduction in one move. Malformed lines skipped silently. One doc per file: `ref` = absolute file path, `hash` = `fileHashBytes` of the raw file (append-heavy files re-gate correctly).

### Ingest path
- Generalize the existing `upsertVaultFile` into `upsertSourceDoc(kind, ref, text, embedder, hash)`; `upsertVaultFile` becomes a thin wrapper (zero behavior change for vault/PDF). Session docs reuse the same chunk → embed → delete-old-rows → insert machinery and the same `(sourceKind, sourceRef, chunkIndex)` unique index.
- Schema: add `'session'` to the `source_kind` enum — additive migration (`ALTER TYPE ... ADD VALUE`), generated via `db:generate`, applied by `db:push` (external) / boot `migrate()` (embedded).
- CLI: for each source, list docs, hash-gate against stored `contentHash` (skip unchanged), upsert changed/new; per-doc failures log + skip; prints `{ source: { indexed, skipped, failed } }` per source.

### Retrieval
No changes. `search_knowledge` already queries all `embeddings` rows; session chunks return with `claude-mem#123` or the transcript path as `citation`. Every MCP-connected tool gets cross-tool history immediately.

## Privacy note (documented, not blocking)

Raw transcripts can contain pasted secrets. The user/assistant-text-only filter drops tool outputs (env dumps, file contents), the main leak vector. Pattern-based redaction is deferred to a later slice; the README documents that session ingestion indexes conversation text into the local DB.

## Error handling

- Missing source (no claude-mem, no transcripts dir) → skipped, not an error.
- Locked/corrupt claude-mem DB → one warning, skip source, next run retries.
- Malformed jsonl lines → skipped silently; per-file parse failure → log + skip file.
- Embedding failure per doc → log + skip (hash not stored, retried next run).

## Testing (existing suite, real PG, fake embedder)

- claude-mem reader: build a fixture SQLite DB in a temp dir via `node:sqlite` (schema: observations with id/title/narrative/facts/concepts/project/created_at), assert docs + refs + window filtering; absent DB → empty list.
- claude-code reader: fixture `.jsonl` with user/assistant/tool_use/tool_result/queue lines → assert only user+assistant text extracted, tool noise absent; malformed line tolerated.
- `upsertSourceDoc`: round-trip under `sourceKind='session'` + hash-gate skip on second run; vault wrapper behavior unchanged (existing vault tests are the regression net).
- Enum migration: an `embeddings` insert with `source_kind='session'` succeeds.
- Retrieval: an ingested session doc retrievable via `searchKnowledge` with its ref as citation (unique-text technique).

## Acceptance

- `npm run ingest:sessions` on this machine ingests recent claude-mem observations + Claude Code transcripts; re-run reports all-skipped (hash gate).
- Via MCP `search_knowledge`, a query about work done in a past Claude Code session returns a session chunk with a `claude-mem#<id>` or transcript-path citation — from any connected tool.
- Full server suite + typecheck green; vault/PDF ingestion behavior unchanged.

## Deferred
- Gemini / Antigravity / Codex / local-LLM readers (same interface; Antigravity `brain` dir first candidate).
- Secret redaction; live watching; transcript summarization; deletion mirroring.
