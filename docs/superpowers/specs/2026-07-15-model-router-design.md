# Model Matrix + Router (Phase 19) — Design

Approved 2026-07-15: per-model selection inside each agent; catalog lives in
relay.json; routing strategy made real via role→agent+model policy (no HTTP
proxy — subscription CLIs own their auth; we route which CLI+model runs).

## relay.json extensions (backward compatible)

Agent entries MAY add:

- `models`: array of `{ name: string, tier: "free" | "cheap" | "expensive", quality: 1-5 }`.
  First entry = the agent's default model.
- cmd MAY contain `{model}` — substituted like {prompt}/{workdir}. Agents
  without `models`/`{model}` behave exactly as today (their CLI default).

Prefilled catalog (owner edits the file to taste):

- claude / claude-work: cmd gains `--model {model}`; models: opus (expensive,5),
  sonnet (cheap,4), haiku (free,3).
- agy-*: `--model {model}` replaces the hardcoded value; models: "Gemini 3.1 Pro (High)"
  (cheap,4), "Gemini 3.5 Flash (High)" (cheap,3), "Gemini 3.5 Flash (Low)" (free,2),
  "GPT-OSS 120B (Medium)" (free,2). Collapse agy-gemini/flash/oss into ONE `agy`
  entry (roles plan/work/review) since models now differentiate.
- codex: `-m {model}`; models: gpt-5.6-sol, gpt-5.6-terra, gpt-5.6-luna
  (expensive,5), gpt-5.5 (cheap,4), gpt-5.4 (cheap,3). (Names are cmd args —
  owner corrects them if OpenAI's slugs differ.)

Config validation (config.ts): models optional; if present, non-empty, names
non-empty strings, tier in enum, quality 1-5 integer.

## Selection plumbing

- `substituteCmd` gains `model` var; `runAgent` signature unchanged (model is
  resolved into cmd before spawn — new helper `resolveCmd(agent, model?)` in
  config.ts returns a cmd with {model} substituted, validating the model is in
  the agent's list; no {model} in cmd + model requested → error).
- `POST /forge/pipeline` accepts optional `planModel/workModel/reviewModel`;
  runs.ts threads them through; RunSummary + forge_runs gain the chosen models
  (migration ONLY if columns missing — store as `plan_agent` = "agent:model"
  composite instead; NO new migration: encode "agent:model" in the existing
  agent name columns and in RunSummary.agents values).
- `GET /forge/agents` → `[{ name, roles, models: [{name,tier,quality}] }]`.

## Router (src/forge/router.ts)

`pickAgents(config, strategy): { plan, work, review } as { agent, model? }`

- Enumerate (agent, model) pairs per role (agents without models = one pair,
  tier "cheap", quality 3 defaults).
- `cheapest-first`: lowest tier (free<cheap<expensive), quality tiebreak desc.
- `quality-first`: highest quality, tier tiebreak (cheaper wins).
- `balanced` (default): plan+review = quality-first; work = cheapest-first.
- Strategy read from settings key `ai.routing_strategy` (already exists in UI).

Pipeline accepts agent value `"auto"` for any role → router resolves it.

## Escalation

When resolving `"auto"` for work: count prior FAILED-review attempts for the
ticket = number of review comments with FAIL verdict (parseVerdict over
comments — simpler and more durable than forge_runs). attempts 0-1 → strategy
pick; attempts ≥2 → next quality tier above the strategy pick (cap at max).
Unit-tested pure function `escalate(pairs, basePick, attempts)`.

## UI

Forge dropdowns become agent+model (single flattened select listing
"agent · model" pairs plus one "Auto (strategy)" entry at top, default Auto).
Pipeline POST sends either explicit pairs or "auto".

## Tests

Router unit (strategies, escalation, no-models agents); config validation;
resolveCmd substitution + unknown-model rejection; pipeline "auto" e2e with
fake agents carrying models; API surface (agents include models; pipeline
accepts auto + explicit model; invalid model 400). UI test: Auto default posts
"auto".
