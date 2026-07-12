# Codex + Antigravity Session Readers (Design Spec)

## Context

Phase 6 made recent session history searchable across tools, but only for Claude (claude-mem observations + Claude Code transcripts). The user runs Codex and Antigravity alongside Claude; their sessions are invisible to `search_knowledge`. This slice adds both readers behind the existing `SessionSource` seam. User approved the phase explicitly; details decided autonomously from on-disk recon.

## Recon facts (verified on this machine)

- **Codex**: `~/.codex/sessions/YYYY/MM/DD/rollout-<ts>-<uuid>.jsonl`. Each line `{timestamp, type, payload}`. Clean conversation text lives in `type:"event_msg"` lines with `payload.type: "user_message" | "agent_message"` and `payload.message: string`. Everything else (reasoning, tool calls, token counts, world_state) is noise for retrieval purposes.
- **Antigravity**: `~/.gemini/antigravity/` holds `brain/` and `conversations/` directories — both currently EMPTY on this machine. Antigravity's Agent Manager writes markdown artifacts (task lists, plans, walkthroughs) under `brain/<conversation-id>/` as it works; raw conversations are cloud-side. The reader ingests whatever markdown/text files appear there and no-ops gracefully while empty.

## Design

Two new `SessionSource` implementations, wired into the existing CLI list; nothing else changes (hash-gating, 30-day window, `session` sourceKind, batched transactional upserts all come from the seam).

- `src/ingest/sessions/codex.ts` — `makeCodexSource(sessionsDir = ~/.codex/sessions)`: walk the `YYYY/MM/DD` tree, mtime-filter files by `sinceDays`, per file: parse lines, keep `event_msg` `user_message`/`agent_message` payload text as `User:`-less plain paragraphs (same join-with-blank-line convention as claude-code), skip unparseable lines, cap text at the same 200k tail, `ref` = absolute file path, `hash` = raw file bytes sha256 (`fileHashBytes`). Empty text → skip file. Missing dir → `[]`.
- `src/ingest/sessions/antigravity.ts` — `makeAntigravitySource(rootDir = ~/.gemini/antigravity)`: recursively walk `brain/` and `conversations/`, mtime-filter by `sinceDays`, ingest `.md`/`.txt` files as-is (they are already prose artifacts; no parsing), one `SessionDoc` per file, same 200k cap and hash. Missing/empty dirs → `[]` (must not warn — empty is the normal state until Antigravity writes artifacts).
- `src/ingest/sessions/cli.ts` — add both sources to the array passed to `ingestSessions`.
- `README.md` — session-memory section lists the four sources and notes Antigravity artifacts appear only after agent runs.

## Approaches considered

1. **event_msg extraction for Codex (chosen)** — clean user/assistant text, tool noise excluded by construction; mirrors the claude-code reader's shape.
2. `response_item:message` extraction — includes `developer` role instruction dumps and duplicates much of what event_msg carries; more filtering for no retrieval gain.
3. Codex `history.jsonl` (global prompt history) — prompts only, no assistant side; rejected as primary but harmless to add later.
4. Antigravity `state.vscdb` sqlite spelunking — inspected; conversation data is NOT in ItemTable (global or workspace). Brain artifacts are the documented local trace. Chosen accordingly.

## Error handling

Same contract as existing readers: per-file failures warn + skip; a reader never throws out of `listSessionDocs`; unreadable root → `[]`.

## Testing

Fixture-driven unit tests (same style as existing `tests/ingest-sessions*.test.ts` if present, else new): temp dir with a synthetic codex rollout jsonl (real line shapes, incl. noise lines + one bad line) asserting extracted text contains user+agent messages and excludes reasoning/tool noise; antigravity temp tree with one md artifact + one empty dir case asserting one doc / zero docs; mtime window respected (old file skipped). Live smoke (controller): run `npm run ingest:sessions` against the real machine, confirm codex docs ingest and antigravity contributes zero without warnings.

## Out of scope

Gemini CLI reader (separate store, not requested), codex history.jsonl, parsing Antigravity cloud conversations, secret redaction (existing documented caveat applies to all sources).
