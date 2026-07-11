# Phase 2b — PDF Ingestion + Graphify Docs (Design Spec)

## Context

Phase 2 built the knowledge/RAG layer: a chokidar watcher ingests the Obsidian vault's markdown into pgvector (hash-gated full-index + incremental + delete-on-unlink), searchable via `search_knowledge`. This slice extends ingestion to **PDF** files in the vault, and documents **graphify** as an agent-side skill (no server code).

PDFs are a major knowledge source (SOPs, datasheets, scanned infra docs) that the markdown-only watcher currently ignores. This slice adds a PDF-to-markdown conversion step in front of the existing chunk→embed pipeline, so PDFs become retrievable exactly like markdown — with the PDF's path as the citation.

Scope decided during brainstorming: PDF adapter is server code (built + tested here); graphify is an agent-side skill, documented in the README only.

## Scope of this slice

- Watcher ingests `.pdf` (in addition to `.md`): convert PDF → markdown → the existing chunk/embed/upsert path, `sourceRef` = the PDF's own path.
- Conversion via `@opendataloader/pdf` (Node SDK, requires Java 11+ on the watcher machine).
- Conversion behind an injectable seam so tests use a fake (no JVM in CI).
- Graphify: a README section only — install as an agent skill, point at the vault + repo, use alongside `search_knowledge`.
- Out of scope: hybrid/OCR mode (needs a running Python backend), bounding-box/JSON output, image extraction, PDF/UA accessibility export, any server-side graphify integration.

## Architecture

One new module + changes to the existing watcher; the chunk→embed→upsert path and `search_knowledge` are unchanged.

- `src/ingest/pdf.ts` — `convertPdf(path: string): Promise<string>`: converts a PDF to markdown text and returns it. Uses `@opendataloader/pdf`'s `convert(path, { outputDir, format: "markdown", quiet: true })`, which WRITES a `<basename>.md` into `outputDir` and returns a log string. So `convertPdf` must:
  1. Create a fresh temp dir OUTSIDE the vault (`fs.mkdtempSync(join(tmpdir(), "odl-"))`) — never the default (next-to-input) output, or the produced `.md` would land in the vault and the watcher would double-ingest it.
  2. `await convert(path, { outputDir: tmp, format: "markdown", quiet: true })`.
  3. Read the produced markdown file from `tmp`, return its contents.
  4. Remove the temp dir (finally).
- The converter is injected: `src/ingest/watch.ts` gains a module-level `convertPdf` seam (default the real one) with a `setPdfConverter(fn)` setter so tests inject a fake that returns fixed markdown without spawning a JVM.

## Data flow (changes to `src/ingest/watch.ts`)

- **`walkMd` → `walkDocs`**: collect `.md` AND `.pdf` files.
- **`reindexFile(path, embedder)`** (the shared hash-gated helper) branches on extension:
  - `.md`: unchanged — read utf8, `fileHash(text)`, gate, `upsertVaultFile(path, text, embedder)`.
  - `.pdf`: read RAW BYTES for the hash (the existing `fileHash` assumes utf8 text; a PDF is binary, so hash the bytes: `fileHash` accepts a string today — add a `fileHashBytes(buf: Buffer)` or hash `readFileSync(path)` as a binary-safe digest). Gate against the stored `contentHash` for `(vault, path)`. If changed: `convertPdf(path)` → markdown → `upsertVaultFile(path, markdown, embedder)` with `sourceRef` = the PDF path.
- **chokidar** already watches the vault recursively; extend the `add`/`change` handler to route `.pdf` through the same `reindexFile`. `unlink` already deletes by `sourceRef` (path) generically — works for PDFs unchanged.
- **Startup full-index** (`indexVaultOnce`) already iterates all files from the walk — now includes PDFs via `walkDocs`.

The binary-safe hash for PDFs is the one real correctness point: hashing a PDF as utf8 could mangle bytes and defeat the gate. Hash the raw buffer.

## Error handling

- Conversion failure for one PDF → log + skip that file (the existing per-file `try/catch` in `indexVaultOnce`/`reindex` already isolates failures; the watcher never crashes on one bad file).
- Java missing: `@opendataloader/pdf` needs a JVM. At watcher startup, probe once (attempt a lightweight check or catch the first conversion error) and log a single clear warning ("Java 11+ not found — PDFs will be skipped"); markdown ingestion continues unaffected. Do NOT crash the watcher.
- Empty/garbage conversion (0 chunks) → `upsertVaultFile` already handles zero chunks (returns 0, no rows). Fine.

## Testing

- **`convertPdf` seam**: a fake converter (returns fixed markdown) is injected via `setPdfConverter`. No JVM in CI.
- **PDF ingestion (unit, live Postgres)**: temp dir + a fake `.pdf` file (bytes don't need to be a real PDF — the fake converter ignores content) → `indexVaultOnce` with the fake converter → assert an `embeddings` row exists with `sourceKind='vault'`, `sourceRef` = the PDF path; second run → hash-gate skips (binary hash unchanged); rewrite the PDF bytes → re-index; `handleUnlink` → rows gone.
- **Retrieval**: index the fake-converted PDF markdown, `searchKnowledge` with the exact converted text (unique per run) → the PDF path is the top hit with itself as citation.
- **Binary hash**: assert two different PDF byte sequences produce different hashes and identical bytes produce the same hash (guards the gate).
- **One manual live check** (documented, not CI): drop a real `.pdf` into the vault with Java present, confirm it's retrievable via `search_knowledge` through MCP.
- Reuse Phase 2 vitest + live Postgres on 5433.

## Graphify (agent-side skill — README only, no server code)

Add a README section: graphify (MIT, Python; https://github.com/Graphify-Labs/graphify) is an AI-coding-assistant skill that turns a folder of code/docs/schemas into a queryable knowledge graph (GraphRAG, tree-sitter, Leiden clustering). Install it on the agent machine (Claude Code / Codex / Gemini / Cursor), point it at the Obsidian vault and this repo, and use its graph queries alongside the server's `search_knowledge` — graph traversal for entity/relationship questions, pgvector for semantic similarity. It runs entirely on the agent side; the tickets server neither depends on nor invokes it. Evaluate licensing/fit before relying on it in a workflow.

## Acceptance

- A `.pdf` dropped into the vault becomes retrievable via `search_knowledge` with the PDF path as citation (fake converter in tests; one manual live check with Java).
- An unchanged PDF is skipped on re-index (binary hash gate); editing the PDF re-indexes; deleting it removes its chunks.
- Markdown ingestion is unaffected; a missing JVM warns once and skips PDFs without crashing the watcher.
- Full suite + typecheck green.
- README documents the Java 11+ requirement for PDF ingestion and the graphify agent-skill setup.

## Deferred
- Hybrid/OCR mode (Python backend), JSON-with-bounding-boxes output for richer citations, image extraction.
- Server-side graphify integration.
