# Agent Relay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `npm run relay -- --role plan|work|review --agent <name>` drives tickets through open → planned → in_progress → review → closed by invoking configured headless agent CLIs (Fable plans, cheap/local models work, good model reviews), with atomic claims and full audit attribution.

**Architecture:** Additive migration (ticket status values `planned`/`review`; `comments.kind`); a local runner (`src/relay/`) that talks to the REST API with its own actor key and spawns configured CLIs arg-vector-style from `~/.vibeops/relay.json` (never from the settings DB — executable config stays file-local). Spec: `docs/superpowers/specs/2026-07-13-agent-relay-design.md` — read it first; its Security and Error-handling sections are binding.

**Tech Stack:** node:child_process spawn (arg vector, no shell), existing REST API, drizzle migration.

## Global Constraints

- Migrations additive-only via `npm run db:generate`; never hand-edit `drizzle/meta`. NOTE: pgEnum ADD VALUE — drizzle-kit generates `ALTER TYPE ... ADD VALUE`; verify the generated SQL and that the embedded-db test passes (PGlite supports ADD VALUE; if generation produces something destructive, STOP and report).
- Status transitions the relay performs must use the existing optimistic-lock update path (`expectedVersion`) — the claim (`planned → in_progress`) races MUST resolve 409 for the loser.
- Relay config: `~/.vibeops/relay.json` ONLY (0600 on write if the runner creates a template). Command execution: `spawn(cmd[0], cmd.slice(1))` after placeholder substitution — NEVER `shell: true`, NEVER string concatenation into a shell.
- Reviewer verdict: line matching `/^VERDICT:\s*(PASS|FAIL)/m`; anything else = FAIL (fail-closed).
- Worker/reviewer stdout capped at 100k chars before posting as a comment. `git diff` in review prompts capped at 150k chars.
- CLI timeout default 30min (`timeoutMs` per agent in config); on timeout/non-zero exit → post failure tail as `report`/`review` comment and bounce ticket to `planned` — never leave `in_progress`.
- Suite stays offline: integration tests use a fake agent (node script) via a temp relay.json; never invoke real agent CLIs.
- Stage ONLY files your task names. Never push. Docker PG :5433 up.

---

### Task 1: Migration + workflow surface (status values, comment kinds)

**Files:**
- Modify: `src/db/schema.ts` (ticketStatus enum + comments.kind)
- Generated: `drizzle/0005_*.sql` + meta (via `npm run db:generate`)
- Modify: `src/services/tickets.ts` (updateTicket status type), `src/services/comments.ts` (addComment kind param), `src/api/app.ts` (comments POST passes kind), `src/mcp/server.ts` (update_ticket status zod enum + comment kind)
- Test: `tests/relay-workflow.test.ts` (create)

**Interfaces:**
- Produces: status values `"planned" | "review"` usable everywhere status is; `addComment(actorId, ticketId, body, kind?: "comment"|"plan"|"report"|"review")` (default `"comment"`); comments rows carry `kind`. Task 2 consumes both via REST.

- [ ] **Step 1: Schema edits** — `ticketStatus` enum gains `"planned", "review"` (append to the array); `comments` table gains `kind: text("kind").notNull().default("comment")`.
- [ ] **Step 2: `npm run db:generate`** — inspect `drizzle/0005_*.sql`: expect two `ALTER TYPE "ticket_status" ADD VALUE` + one `ALTER TABLE "comments" ADD COLUMN`. Anything destructive → STOP, report.
- [ ] **Step 3: Widen the type surface** — tickets service `updateTicket` patch type + MCP `update_ticket` zod enum gain the two values; `addComment` gains optional `kind` (whitelist the four values, default comment; invalid → NotFoundError? no — throw plain Error mapped 500? Use existing pattern: validate at REST boundary → 400, service accepts the union type). REST `POST /tickets/:id/comments` accepts optional `kind` with 400 on invalid. `GET /tickets/:id/comments` must return `kind`.
- [ ] **Step 4: Write tests** (`tests/relay-workflow.test.ts`, mirror notes-api conventions): PATCH ticket to `planned` then `review` → 200s + status round-trips; comment with `kind: "plan"` → echoed in GET; invalid kind → 400; embedded-db migration proof is covered by the existing embedded test staying green.
- [ ] **Step 5: Gates + commit** — `npm run db:push && npm test && npx tsc --noEmit` green.

```bash
git add src/db/schema.ts drizzle/ src/services/tickets.ts src/services/comments.ts src/api/app.ts src/mcp/server.ts tests/relay-workflow.test.ts
git commit -m "feat: pipeline ticket states and typed handoff comments"
```

---

### Task 2: Relay runner core

**Files:**
- Create: `src/relay/config.ts`, `src/relay/prompts.ts`, `src/relay/invoke.ts`, `src/relay/runner.ts` (CLI entry), `src/relay/api.ts` (thin REST client)
- Modify: `package.json` (script `"relay": "tsx src/relay/runner.ts"`)
- Test: `tests/relay-unit.test.ts` (create)

**Interfaces (exact, Task 3 depends on these):**
- `config.ts`: `type RelayAgent = { cmd: string[]; roles: string[]; timeoutMs?: number }`; `type RelayConfig = { workdir: string; apiKey?: string; baseUrl?: string; pollMs?: number; agents: Record<string, RelayAgent> }`; `loadRelayConfig(path?): RelayConfig` (default `~/.vibeops/relay.json`; missing file → throw with a message that includes a sample config; validates cmd is a non-empty string array).
- `prompts.ts`: `composePlanPrompt({ticket, knowledge})`, `composeWorkPrompt({ticket, plan, knowledge, workdir})`, `composeReviewPrompt({ticket, plan, report, diff})` — all return strings; work prompt REQUIRES the trailing instruction "End your output with a section starting `REPORT:`"; review prompt REQUIRES "End with exactly one line `VERDICT: PASS` or `VERDICT: FAIL` followed by findings if FAIL."; `parseVerdict(output): { pass: boolean; raw: string }` (fail-closed).
- `invoke.ts`: `runAgent(agent: RelayAgent, prompt: string, workdir: string): Promise<{ ok: boolean; output: string }>` — substitutes `{prompt}` (inline arg), `{promptFile}` (temp file path containing the prompt; cleaned up after), `{workdir}` in the cmd array; `spawn(cmd[0], rest, { cwd: workdir })`, captures stdout+stderr (100k cap), enforces timeout (kill tree on Windows: `taskkill /pid /T /F`), ok = exit 0.
- `api.ts`: minimal fetch wrapper (baseUrl default `http://127.0.0.1:8787`, key from config.apiKey ?? credentials.json): `listTickets(status)`, `getTicket(id)`, `getComments(id)`, `updateTicket(id, expectedVersion, patch)` (409 → returns `{conflict:true}`), `addComment(id, body, kind)`.
- `runner.ts`: arg parsing (`--role`, `--agent`, `--ticket`, `--watch`, `--config`), role loops:
  - plan: ticket (given or oldest `open`) → compose (knowledge = GET /knowledge?q=title, top 5) → runAgent → `addComment(kind:"plan")` → status `planned`.
  - work: claim = `updateTicket(id, version, { status: "in_progress" })`; on conflict pick next. Then compose work prompt (latest plan comment) → runAgent → `addComment(kind:"report", output)` → status `review`. On !ok → report comment with tail + bounce `planned`.
  - review: compose (plan + latest report + `git diff` via spawn in workdir, 150k cap) → runAgent → parseVerdict → PASS: status `closed` + review comment; FAIL: review comment with findings + bounce `planned`.
  - `--watch`: `while(true)` with pollMs sleep, per-iteration try/catch.

- [ ] **Step 1: Unit tests first** (`tests/relay-unit.test.ts`) — pure pieces only: `parseVerdict` (PASS/FAIL/missing/garbage → fail-closed), prompt composers include ticket title/plan/diff and the mandatory trailing instructions, `loadRelayConfig` throws helpfully on missing file + rejects `cmd: "string"`, placeholder substitution in `invoke.ts`'s exported `substituteCmd(cmd, vars)` helper (pure; `{prompt}`/`{workdir}`/`{promptFile}` replaced, arrays untouched otherwise). `runAgent` smoke: run `[process.execPath, "-e", "console.log('hi')"]` → ok:true output hi; timeout: `-e "setTimeout(()=>{},60000)"` with timeoutMs 500 → ok:false.
- [ ] **Step 2:** Implement the five modules per the interfaces.
- [ ] **Step 3:** Gates: `npx vitest run tests/relay-unit.test.ts` then full `npm test && npx tsc --noEmit`.
- [ ] **Step 4: Commit**

```bash
git add src/relay tests/relay-unit.test.ts package.json
git commit -m "feat: agent relay runner — plan, work, and review over headless CLIs"
```

---

### Task 3: Pipeline integration test + README

**Files:**
- Create: `tests/relay-pipeline.test.ts`, `tests/fixtures/fake-agent.mjs`
- Modify: `README.md`

**Interfaces:** consumes Task 1's states/kinds + Task 2's runner functions (import role functions directly — `runPlan/runWork/runReview(config, opts)` should be exported from runner.ts for testability; the CLI entry just dispatches to them).

- [ ] **Step 1: Fake agent** (`tests/fixtures/fake-agent.mjs`): reads argv/stdin prompt, prints a canned response based on `FAKE_MODE` env: `plan` → "1. do the thing", `work` → "did it\nREPORT: changed x", `review-pass` → "looks good\nVERDICT: PASS", `review-fail` → "broken\nVERDICT: FAIL\n- fix y".
- [ ] **Step 2: Pipeline test** — temp relay.json pointing every role at `[process.execPath, "tests/fixtures/fake-agent.mjs", "{prompt}"]` with FAKE_MODE set per phase (config per invocation or env). Against the in-process app (like other API tests) OR the runner's api client pointed at a spawned server — prefer in-process: export the role functions and inject the api client if that's simpler; keep it honest (real DB, real status transitions). Assert: open ticket → runPlan → plan comment + `planned`; runWork → claimed (assignee set, then `review`, report comment); runReview (fail mode) → bounced `planned` + review comment; runReview (pass mode after re-work) → `closed`. Claim race: create ONE planned ticket, run two runWork claims concurrently with stubbed agent → exactly one succeeds, other moves on/no-ops.
- [ ] **Step 3: README** — "Cross-model pipeline (relay)" section: the cost story (plan expensive once, work cheap/local, review briefly), quickstart (`~/.vibeops/relay.json` sample incl. the `codex exec --oss` local-LLM worker note + Ollama-not-required-until-then), the one-command flow, the security note (why command templates live in a local file, never the DB).
- [ ] **Step 4:** Full gates + commit.

```bash
git add tests/relay-pipeline.test.ts tests/fixtures/fake-agent.mjs README.md
git commit -m "feat: relay pipeline integration test and docs"
```

---

## Final steps (controller)

Live smoke with a REAL agent: relay.json pointing plan at `codex exec` (cheapest real check available headless on this machine), one throwaway ticket through plan at minimum; full pipeline live if time allows. Whole-branch review (opus — command execution + workflow integrity: config-not-in-DB holds? spawn arg-vector everywhere? fail-closed verdict? claim atomicity?). Fix wave, gates, payload refresh (server schema changed), ledger + memory.
