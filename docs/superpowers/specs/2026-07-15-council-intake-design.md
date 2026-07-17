# Council Intake (Phase 21) — Design

Approved 2026-07-15: council-gated ticket creation (hex/claude-council concept,
4 personas). 3 parallel cheap persona calls + strong chairman. The council
rates the prompt, asks the user clarifying questions, and only then creates
the ticket — saved in SPEC form so the forge plan/work/review journey starts
from a real spec.

## Personas (prompt templates, src/council/personas.ts)

- Believer (optimist): best case, uncapped potential. 
- Investor (realist): economics, effort/cost, time-to-market, maintenance.
- Skeptic (roaster): actively destroys the idea — hidden flaws, why it fails.
- Chairman (verdict): synthesizes all three + the raw prompt into: rating /10,
  GO / NO-GO / NEEDS-INFO, up to 5 clarifying questions for the user, and a
  draft SPEC (problem, approach, acceptance criteria — markdown).
  Output contract (line-anchored, fail-closed parse like VERDICT):
  `RATING: <n>/10`, `DECISION: GO|NO-GO|NEEDS-INFO`, `QUESTIONS:` block,
  `SPEC:` block to end.

## Engine (src/council/runs.ts — mirrors forge/runs.ts patterns)

In-memory council sessions (Map, cap 3 active, poll-based output, same
redact/append helpers — extract shared helpers ONLY if trivial; copying the
~30 lines is acceptable, note it):

- `POST /council/evaluate { prompt, projectId? }` (admin) → { councilId }.
  Round 1: three persona runAgent calls IN PARALLEL (Promise.all) using the
  router's cheapest-first pick for role "plan"; then chairman using
  quality-first pick. Output streamed into the session buffer with
  `=== COUNCIL believer ===` style markers.
- `GET /council/:id` → { status, rating, decision, questions[], spec, output offset polling like forge }.
- `POST /council/:id/answers { answers: string[] }` → Round 2: chairman re-runs
  with original prompt + persona outputs + Q&A pairs → revised RATING/DECISION/
  SPEC (loop allowed: may return more questions; cap 3 rounds then force
  decision).
- `POST /council/:id/create-ticket { projectId }` (admin) → requires decision
  GO (or NEEDS-INFO explicitly overridden with `force: true`); creates ticket:
  title = first line of spec (or chairman-provided TITLE: line), body = full
  spec markdown + council verdict footer (rating + one-line per persona
  summary); status open. Returns the ticket. Council session marked consumed.

No DB table: sessions are ephemeral; the ticket body carries the durable spec
(comments/audit as usual once forge runs).

## UI — New Ticket page upgrade

app/src/routes/create.tsx grows a "Council" mode (default; "Quick create"
stays as the plain form): prompt textarea → Evaluate → live console (poll) →
verdict card (rating badge, decision, persona summaries collapsed) →
questions form (one text input per question) → Submit answers → (loop) →
final spec preview (rendered markdown or pre) → "Create ticket" (project
select) → navigate to the ticket. Errors inline.

## Tests

Persona/chairman parse (fail-closed: garbage → NEEDS-INFO, rating 0); engine
with fake agents (fixture gains council modes: believer/investor/skeptic +
chairman-go/chairman-questions): parallel round 1 produces all sections,
questions round-trips, create-ticket gates on GO, force override, 3-round cap;
API authz rows; UI tests (evaluate posts prompt, questions render from mock,
create posts and navigates).
