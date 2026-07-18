# Prompt Memory (Phase 22) — Design

Owner idea 2026-07-17: we replaced hidden thinking with narrated chain-of-thought;
now close the loop — after each pipeline run, an analyzer model reads the
narration + outcome and improves our prompt wording, so recurring
misunderstandings get replaced with phrasing the models demonstrably follow.

## Loop

1. **Capture** (exists): every forge run's narrated output, stage markers,
   verdicts, bounce counts, and review findings are already persisted
   (comments + forge_runs + console buffer at settle time).
2. **Analyze** (new): when setting `prompts.selfImprove` = "true", settle()
   fires-and-forgets an analyzer call (router cheapest plan-capable pick — a
   cheap model rules the memory, per owner). Input: the run's console output
   (capped 30k), the verdict/outcome, and the CURRENT lessons document.
   Output contract, line-anchored fail-closed (parse like parseVerdict):
   `LESSONS:` followed by the complete REWRITTEN lessons document (not a
   delta). No `LESSONS:` line → no update.
3. **Curate** (the rule): the analyzer's job is to maintain ONE living
   document, not append: merge the new observation, generalize duplicates,
   drop anything stale or unconfirmed, keep every lesson as a concrete
   phrasing rule ("write X, not Y — workers misread Y as Z"). HARD CAPS
   enforced in code, not trust: 1500 chars max (truncate), redactSecrets,
   plain text only.
4. **Apply** (new): `lessonsClause()` (styleClause pattern) reads the lessons
   document and appends it to PLAN and WORK prompts under a
   "Prompting lessons learned (follow these):" header. Never appended to
   REVIEW prompts (verdicts stay uninfluenced). Lessons AUGMENT the hard
   clauses (PLAN_ONLY, relative-paths, narration) and can never remove them —
   they are concatenated after, and the analyzer prompt forbids contradicting
   them.

## Storage

The lessons document = a note with fixed title `prompt-lessons` (scope
global) — versioned, visible and editable in the Notes panel (owner can prune
or veto by hand), embedded into knowledge search like any note. Engine
helpers: `getLessons()` / `setLessons(text)` in a new `src/forge/lessons.ts`
(find-by-title via listNotes, create-or-update with optimistic version retry
once).

## Safety

Self-modifying prompt chain — guards: opt-in setting (default off); code-side
caps (1500 chars, redaction, plain text); hard prompt clauses always win by
ordering and by analyzer instruction; the document is a human-visible note
with full version history; analyzer failures are silent no-ops (never blocks
a pipeline).

## Analyzer prompt (src/council-style template in lessons.ts)

"You maintain the prompt-lessons document for an AI dev pipeline. Study this
run's narrated output and outcome. If the worker or planner misunderstood an
instruction, identify the wording that failed and the wording that would have
worked. Rewrite the COMPLETE lessons document: merge, generalize, drop stale
entries; max 12 lessons; each one line, imperative, concrete. Never
contradict: workers write files only, relative paths only, no git commits,
REPORT:/VERDICT: contracts. End with `LESSONS:` then the document."

## Tests

lessons.ts unit (get/set round-trip, cap truncation, redaction, parse
fail-closed: no LESSONS: → null); runs.ts integration with fake agent: run
with selfImprove on → lessons note created/updated (fixture mode
`analyzer` printing a LESSONS: block); lessons appear in subsequent plan
prompt (observable: fake analyzer writes a marker word; next run's... prompt
not observable via fixture — instead unit-test lessonsClause directly);
review prompt never contains lessons (grep-level assertion on compose usage);
off by default → no analyzer call (fetch/spawn count).

## UI

One toggle in AI Models tab next to comm profile: "Self-improving prompts"
persisting `prompts.selfImprove`. The document itself is just a note —
NotesPanel already renders and edits it.
