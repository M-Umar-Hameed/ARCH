# Agent Relay — Cross-Model Plan/Work/Review Pipeline (Design Spec)

## Context

The user's binding methodology (plan with the best model, implement with cheap supervised workers, nothing passes without review) currently runs only inside one tool's subagents. The ask: run it ACROSS vendors through VibeOps — e.g. Fable plans, Gemini or a local model works, the good model reviews — to cut cost. User approved building this first.

## Feasibility facts (verified on this machine)

- `codex exec` — headless Codex, full tool harness, `-C <dir>` for workdir; `--oss` runs local Ollama models through the same harness (Ollama not yet installed — the local-LLM path is real but deferred to whenever it is).
- `npx @google/gemini-cli` v0.50.0 — headless `-p`, own harness.
- `claude -p` — headless Claude Code.
- VibeOps already has the substrate: tickets with optimistic locking (atomic claims), per-agent keys/attribution, comments, knowledge search for context injection.

## Architecture: choreography + headless relay

VibeOps stays the source of truth; a local **relay runner** invokes agents' own headless CLIs. No agent runtime is built inside VibeOps — each CLI brings its own tool harness. The ticket is the unit of work and the handoff protocol.

### Pipeline states (tickets.status, additive enum values)

`open → planned → in_progress → review → closed`, with review able to bounce back to `planned` (rework). Existing values keep working; new values are additive (`ALTER TYPE ... ADD VALUE` — works on PG and PGlite; additive-only migration rule holds).

### Structured handoff (comments.kind, additive column)

`comments.kind text not null default 'comment'` with values `comment | plan | report | review`. The plan lives as a `plan` comment; worker output as `report`; supervisor verdict as `review`. Machine-readable without inventing new tables.

### The relay runner (`src/relay/`, run locally — never inside the server)

`npm run relay -- --role plan|work|review --agent <name> [--ticket <id> | --watch] [--project <key>]`

- **plan**: takes an `open` ticket, composes a planning prompt (ticket title/body + top-k `search_knowledge` + instructions to output an implementation plan with acceptance criteria), invokes the configured planner CLI, posts the output as a `plan` comment, sets status `planned`.
- **work**: claims the oldest `planned` ticket (guarded update `status planned → in_progress` + assignee = the relay's actor; optimistic lock makes claims atomic — two runners cannot take the same ticket), composes a work prompt (plan + ticket + knowledge + "work in {workdir}; end with a REPORT section"), invokes the worker CLI headlessly in the configured workdir, captures stdout (capped), posts as `report` comment, sets `review`.
- **review**: takes a `review` ticket, composes a review prompt (plan + report + `git diff` from the workdir, size-capped), invokes the reviewer CLI, parses a mandatory verdict line (`VERDICT: PASS` / `VERDICT: FAIL`), then either closes the ticket or posts the findings as a `review` comment and bounces status to `planned`.
- `--watch`: poll loop (interval configurable, default 30s) for the given role.
- Every action goes through the existing REST API with the relay's own actor key — full audit attribution ("gemini-worker claimed T-42").

### Configuration — local file, NOT the settings DB (security-critical)

`~/.vibeops/relay.json` (0600):

```json
{
  "workdir": "D:/Github/myproject",
  "apiKey": "<relay actor key or omit to use credentials.json>",
  "agents": {
    "fable":  { "cmd": ["claude", "-p", "{promptFile}"], "roles": ["plan", "review"] },
    "codex":  { "cmd": ["codex", "exec", "-C", "{workdir}", "{prompt}"], "roles": ["work"] },
    "gemini": { "cmd": ["npx", "@google/gemini-cli", "-p", "{prompt}"], "roles": ["work"] },
    "local":  { "cmd": ["codex", "exec", "--oss", "-m", "qwen2.5-coder", "-C", "{workdir}", "{prompt}"], "roles": ["work"] }
  }
}
```

Command templates are executable configuration. If they lived in the settings DB, any admin API key could rewrite them and the next relay run would execute arbitrary commands — turning an HTTP credential into shell access. Keeping them in a local 0600 file means only someone who already has file access (i.e., already has shell) can change them. The runner is a CLI the user starts; the server never spawns configured commands. `{prompt}` substitutes inline (arg-vector spawn, never shell interpolation); `{promptFile}` writes the prompt to a temp file for CLIs that handle long input better.

### Cost model (the point)

Plan once with the expensive model; N implementation tasks with cheap/free workers (gemini flash tier, codex low effort, later `--oss` local); review briefly with the expensive model. The expensive model's tokens scale with plans+reviews, not with implementation churn — the same economics as this project's own subagent methodology, now vendor-agnostic.

## Approaches considered

1. **Headless relay over agents' own CLIs (chosen)** — each CLI brings its own harness; VibeOps adds states, claims, audit, context.
2. Build an agent runtime inside VibeOps (direct LLM APIs + tool loop + file edits) — months of work duplicating Claude Code/Codex, worse than all of them. Rejected.
3. Pure convention (no runner; humans paste between CLIs) — works today but nothing enforces the pipeline; the runner is the productization.

## Error handling

CLI non-zero exit / timeout (configurable, default 30min) → `report` comment with the failure tail, ticket bounced to `planned` with a `relay: worker failed` note — never left stuck in `in_progress`. Reviewer output missing a `VERDICT:` line → treated as FAIL (fail-closed) with the raw output attached. Claim races resolve via 409 (loser moves to the next ticket). Watch loop survives individual ticket failures.

## Testing

Unit: prompt composition (plan/work/review include the right pieces, size caps applied); verdict parsing (PASS/FAIL/missing → fail-closed); config load/validation (missing file → clear error; template substitution arg-safe). Integration: fake agent CLI (a node script echoing a canned plan/report/`VERDICT: PASS`) wired via relay.json in a temp home — full pipeline against the real API: open → plan comment + planned → claimed + report + review → closed; bounce path on `VERDICT: FAIL`; claim race (two workers, one ticket) → exactly one winner. All offline, no real agent CLIs in the suite.

## Out of scope (v1)

UI pipeline board (statuses/comments already visible in existing screens), parallel multi-ticket scheduling, cost accounting per run (pairs with the usage-log writers ticket), Ollama installation, retry budgets, cross-machine workers.
