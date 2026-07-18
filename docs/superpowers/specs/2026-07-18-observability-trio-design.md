# Observability Trio (Phase 24) — Design

Owner ask 2026-07-18: (a) node-form knowledge graph under a toggle on the
Knowledge tab; (b) per-project sessions browser like claude-mem; (c) one
everything-connected status view showing what's up and what's down.

## c. System status board (build first — repurposes the decorative topology widget)

Backend `GET /system/status` (member): aggregated component health, each
`{ name, status: "up" | "down" | "off", detail }`, all checks never-throw:

- db: trivial select 1.
- embedder: getEmbedder().model + dim (up if constructible; no embed call).
- vault watcher: getVaultStatus() (running/path).
- sessions auto-sync: setting sessions.autoSync !== "false" -> up/off + last
  boot summary if cheaply available (skip if not).
- relay agents: for each relay.json agent, existsSync on cmd[0] when it is an
  absolute path (up/down), "unknown" for PATH-resolved names. NEVER expose the
  full cmd — name + up/down only.
- forge: active run count + last persisted run status (forge_runs).
- marketplaces: count from registry.
- connectors: for github/gitlab/jira/asana — "configured" when their
  credential settings are non-empty, "off" otherwise (never echo values).

Frontend: replace the Dashboard's NETWORK TOPOLOGY card contents with this
list (green/amber/grey dots + detail line); keep the card shell/styling.

## b. Sessions browser

Backend `GET /knowledge/sessions?limit=50` (member): distinct session docs
from embeddings (sourceKind "session"): ref, chunk count, latest createdAt,
first-chunk excerpt (200 chars). Sessions are not project-scoped today —
expose the list globally, client-side filter box (by ref/agent substring);
note "per-project session scoping" as a follow-up ticket, do not fake it.

Frontend: "Sessions" sub-tab on the Knowledge page (alongside search):
list rows (ref, when, chunks, excerpt), click -> full reassembled source via
existing GET /knowledge/source?kind=session&ref=..., rendered in the existing
source viewer. Filter input.

## a. Knowledge graph toggle

Backend `GET /knowledge/graph?limit=60` (member): nodes = the most recent
docs per sourceRef (kind, ref, chunkCount, createdAt), edges = cosine
similarity between doc CENTROIDS above 0.45, computed on demand:
select one representative embedding per ref (first chunk), pairwise dot in
SQL is heavy — do it in JS over <=60 vectors (60*60/2 pairs, fine). Cap
response nodes 60, edges 200.

Frontend: toggle on the Knowledge tab ("Graph" view): render with plain SVG —
force-free radial layout (kind-grouped rings: vault inner, notes middle,
sessions outer; deterministic angle by ref hash), edges as lines with opacity
by similarity, node click -> opens the source viewer. NO new dependencies
(no d3); keep it ~150 lines. It is a map, not physics.

## Tests

status: endpoint shape + never-throw (break one check via env, still 200);
sessions: seeded session docs list + excerpt + source round-trip; graph:
seeded docs produce nodes + at least one edge for identical content, caps
respected. UI: tab/toggle render + fetch mocks per existing patterns.
