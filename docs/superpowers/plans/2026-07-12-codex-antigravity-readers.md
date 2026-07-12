# Codex + Antigravity Session Readers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Codex and Antigravity sessions become searchable via `search_knowledge`, through two new `SessionSource` readers wired into `npm run ingest:sessions`.

**Architecture:** Both readers implement the existing `SessionSource` interface (`src/ingest/sessions/source.ts`: `{ source: string; listSessionDocs(sinceDays): Promise<SessionDoc[]> }` where `SessionDoc = { ref, text, hash }`). Hash-gating, the `session` sourceKind, batched transactional upserts, and the 30-day window all live in the existing `ingestSessions` engine — readers only enumerate and extract. Model: `src/ingest/sessions/claude-code.ts`.

**Tech Stack:** node:fs/os/path only. `fileHashBytes` from `src/services/knowledge.ts`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-12-codex-antigravity-readers-design.md`.
- A reader NEVER throws out of `listSessionDocs`: per-file failures `console.warn` + skip; missing root dir → `[]`. Antigravity's empty dirs are the NORMAL state — return `[]` silently, no warning.
- 200k-char tail cap per doc (same as claude-code reader), `ref` = absolute file path, `hash` = sha256 of raw file bytes via `fileHashBytes`.
- Codex text = ONLY `event_msg` lines with `payload.type` `user_message`/`agent_message`, joined with `\n\n`. No reasoning, no tool calls, no `response_item` lines.
- Never push. Commit per task on `master`. Suite needs Docker PG on :5433. Do not `git add` anything outside the files your task names (repo may carry unrelated user WIP).

---

### Task 1: Codex reader

**Files:**
- Create: `src/ingest/sessions/codex.ts`
- Test: `tests/codex-reader.test.ts` (create)

**Interfaces:**
- Consumes: `SessionSource`, `SessionDoc` from `./source.js`; `fileHashBytes` from `../../services/knowledge.js`.
- Produces: `export function makeCodexSource(sessionsDir?: string): SessionSource` with `source: "codex"`. Task 2 wires it into the CLI.

- [ ] **Step 1: Write the failing test**

Create `tests/codex-reader.test.ts`:

```ts
import { expect, test } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeCodexSource } from "../src/ingest/sessions/codex.js";

function rolloutLine(payload: object, type = "event_msg"): string {
  return JSON.stringify({ timestamp: new Date().toISOString(), type, payload });
}

test("codex reader extracts user/agent messages only, skips noise and old files", async () => {
  const root = mkdtempSync(join(tmpdir(), "codex-"));
  const day = join(root, "2026", "07", "12");
  mkdirSync(day, { recursive: true });

  const lines = [
    rolloutLine({ type: "user_message", message: "please fix the login bug" }),
    rolloutLine({ type: "agent_message", message: "I will inspect the auth module." }),
    rolloutLine({ type: "task_started" }),
    rolloutLine({ type: "reasoning", text: "secret chain of thought" }, "response_item"),
    rolloutLine({ type: "message", role: "developer", content: [{ type: "input_text", text: "instruction dump" }] }, "response_item"),
    "{not json",
    rolloutLine({ type: "token_count", count: 5 }),
  ];
  writeFileSync(join(day, "rollout-1.jsonl"), lines.join("\n"));

  // A file older than the window must be skipped.
  const oldDay = join(root, "2026", "01", "01");
  mkdirSync(oldDay, { recursive: true });
  const oldFile = join(oldDay, "rollout-old.jsonl");
  writeFileSync(oldFile, rolloutLine({ type: "user_message", message: "ancient" }));
  const old = new Date(Date.now() - 90 * 24 * 3600 * 1000);
  utimesSync(oldFile, old, old);

  const docs = await makeCodexSource(root).listSessionDocs(30);
  expect(docs).toHaveLength(1);
  expect(docs[0].ref).toBe(join(day, "rollout-1.jsonl"));
  expect(docs[0].text).toBe("please fix the login bug\n\nI will inspect the auth module.");
  expect(docs[0].hash).toMatch(/^[0-9a-f]{64}$/);
});

test("codex reader returns [] for a missing root", async () => {
  expect(await makeCodexSource(join(tmpdir(), "nope-codex")).listSessionDocs(30)).toEqual([]);
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run tests/codex-reader.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/ingest/sessions/codex.ts`**

```ts
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileHashBytes } from "../../services/knowledge.js";
import type { SessionSource, SessionDoc } from "./source.js";

// Rollout jsonl: clean conversation text lives in event_msg lines with
// payload.type user_message/agent_message; everything else is tool/reasoning noise.
function extractText(raw: string): string {
  const out: string[] = [];
  for (const line of raw.split("\n")) {
    let d: any;
    try { d = JSON.parse(line); } catch { continue; }
    if (d?.type !== "event_msg") continue;
    const p = d.payload;
    if (p?.type !== "user_message" && p?.type !== "agent_message") continue;
    if (typeof p.message === "string" && p.message.trim()) out.push(p.message.trim());
  }
  return out.join("\n\n");
}

function* walkJsonl(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    let st;
    try { st = statSync(path); } catch { continue; }
    if (st.isDirectory()) yield* walkJsonl(path);
    else if (name.endsWith(".jsonl")) yield path;
  }
}

export function makeCodexSource(
  sessionsDir = join(homedir(), ".codex", "sessions"),
): SessionSource {
  return {
    source: "codex",
    async listSessionDocs(sinceDays: number): Promise<SessionDoc[]> {
      if (!existsSync(sessionsDir)) return [];
      const cutoff = Date.now() - sinceDays * 24 * 3600 * 1000;
      const docs: SessionDoc[] = [];
      for (const path of walkJsonl(sessionsDir)) {
        try {
          if (statSync(path).mtimeMs < cutoff) continue;
          const buf = readFileSync(path);
          let text = extractText(buf.toString("utf8"));
          if (!text) continue;
          if (text.length > 200_000) text = text.slice(-200_000);
          docs.push({ ref: path, text, hash: fileHashBytes(buf) });
        } catch (e) {
          console.warn(`codex session skipped ${path}: ${(e as Error).message}`);
        }
      }
      return docs;
    },
  };
}
```

- [ ] **Step 4: Run tests** — `npx vitest run tests/codex-reader.test.ts` — Expected: PASS (2).

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/ingest/sessions/codex.ts tests/codex-reader.test.ts
git commit -m "feat: codex session reader"
```

---

### Task 2: Antigravity reader + CLI wiring + README

**Files:**
- Create: `src/ingest/sessions/antigravity.ts`
- Modify: `src/ingest/sessions/cli.ts` (add both new sources to the array passed to `ingestSessions` — read the file; it currently passes `[makeClaudeMemSource(), makeClaudeCodeSource()]`)
- Modify: `README.md` (session-memory section)
- Test: `tests/antigravity-reader.test.ts` (create)

**Interfaces:**
- Consumes: `SessionSource`/`SessionDoc`, `fileHashBytes` (same as Task 1); `makeCodexSource` from Task 1 for the CLI wiring.
- Produces: `export function makeAntigravitySource(rootDir?: string): SessionSource` with `source: "antigravity"`.

- [ ] **Step 1: Write the failing test**

Create `tests/antigravity-reader.test.ts`:

```ts
import { expect, test } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeAntigravitySource } from "../src/ingest/sessions/antigravity.js";

test("antigravity reader ingests markdown artifacts from brain and conversations", async () => {
  const root = mkdtempSync(join(tmpdir(), "antigravity-"));
  const conv = join(root, "brain", "conv-123");
  mkdirSync(conv, { recursive: true });
  writeFileSync(join(conv, "plan.md"), "# Task plan\nRefactor the auth module.");
  mkdirSync(join(root, "conversations"), { recursive: true });
  writeFileSync(join(root, "conversations", "notes.txt"), "walkthrough text");
  writeFileSync(join(conv, "binary.png"), Buffer.from([0x89, 0x50]));

  const oldFile = join(conv, "stale.md");
  writeFileSync(oldFile, "ancient artifact");
  const old = new Date(Date.now() - 90 * 24 * 3600 * 1000);
  utimesSync(oldFile, old, old);

  const docs = await makeAntigravitySource(root).listSessionDocs(30);
  const refs = docs.map((d) => d.ref).sort();
  expect(refs).toEqual([join(conv, "plan.md"), join(root, "conversations", "notes.txt")].sort());
  expect(docs.find((d) => d.ref.endsWith("plan.md"))!.text).toContain("Refactor the auth module.");
});

test("antigravity reader is silently empty for missing or empty dirs", async () => {
  expect(await makeAntigravitySource(join(tmpdir(), "nope-ag")).listSessionDocs(30)).toEqual([]);
  const root = mkdtempSync(join(tmpdir(), "antigravity-empty-"));
  mkdirSync(join(root, "brain"), { recursive: true });
  mkdirSync(join(root, "conversations"), { recursive: true });
  expect(await makeAntigravitySource(root).listSessionDocs(30)).toEqual([]);
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run tests/antigravity-reader.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/ingest/sessions/antigravity.ts`**

```ts
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileHashBytes } from "../../services/knowledge.js";
import type { SessionSource, SessionDoc } from "./source.js";

// Antigravity's Agent Manager writes markdown artifacts (plans, task lists,
// walkthroughs) under brain/<conversation>/; conversations proper are cloud-side.
// Empty dirs are the normal state until an agent runs — stay silent then.
const SUBDIRS = ["brain", "conversations"];
const EXTS = [".md", ".txt"];

function* walkText(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    let st;
    try { st = statSync(path); } catch { continue; }
    if (st.isDirectory()) yield* walkText(path);
    else if (EXTS.some((e) => name.endsWith(e))) yield path;
  }
}

export function makeAntigravitySource(
  rootDir = join(homedir(), ".gemini", "antigravity"),
): SessionSource {
  return {
    source: "antigravity",
    async listSessionDocs(sinceDays: number): Promise<SessionDoc[]> {
      const cutoff = Date.now() - sinceDays * 24 * 3600 * 1000;
      const docs: SessionDoc[] = [];
      for (const sub of SUBDIRS) {
        const dir = join(rootDir, sub);
        if (!existsSync(dir)) continue;
        for (const path of walkText(dir)) {
          try {
            if (statSync(path).mtimeMs < cutoff) continue;
            const buf = readFileSync(path);
            let text = buf.toString("utf8").trim();
            if (!text) continue;
            if (text.length > 200_000) text = text.slice(-200_000);
            docs.push({ ref: path, text, hash: fileHashBytes(buf) });
          } catch (e) {
            console.warn(`antigravity artifact skipped ${path}: ${(e as Error).message}`);
          }
        }
      }
      return docs;
    },
  };
}
```

- [ ] **Step 4: Run tests** — `npx vitest run tests/antigravity-reader.test.ts` — Expected: PASS (2).

- [ ] **Step 5: Wire the CLI**

In `src/ingest/sessions/cli.ts`, import both and extend the sources array:

```ts
import { makeCodexSource } from "./codex.js";
import { makeAntigravitySource } from "./antigravity.js";
```

and change the `ingestSessions([...])` call to:

```ts
ingestSessions([makeClaudeMemSource(), makeClaudeCodeSource(), makeCodexSource(), makeAntigravitySource()], getEmbedder(), sinceDays)
```

(Keep the file's existing structure; only the array grows.)

- [ ] **Step 6: README**

In the "Session memory (cross-tool history)" section, update the source list: claude-mem observations, Claude Code transcripts, Codex sessions (`~/.codex/sessions`), and Antigravity agent artifacts (`~/.gemini/antigravity/brain` + `conversations` — these appear only after Antigravity agent runs; empty is normal).

- [ ] **Step 7: Full suite + typecheck**

Run: `npm test && npx tsc --noEmit` — Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add src/ingest/sessions/antigravity.ts src/ingest/sessions/cli.ts tests/antigravity-reader.test.ts README.md
git commit -m "feat: antigravity session reader and cross-tool ingest wiring"
```

---

## Final steps (controller)

Live smoke: `EMBED_PROVIDER=fake npm run ingest:sessions` on the real machine — codex docs ingest (>0), antigravity contributes zero WITHOUT warnings, claude sources unchanged. NOTE: PGlite is single-process — stop any running dev server on the embedded DB first. Then whole-branch review (sonnet is fine — two isolated readers off a proven seam), fix wave if needed, ledger + memory.
