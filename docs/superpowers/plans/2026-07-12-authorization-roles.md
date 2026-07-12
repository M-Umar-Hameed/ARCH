# Authorization Roles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin/member role enforcement: member keys keep the collaborative work surface but lose settings, filesystem-indexing control, MCP config installs, session ingest, logs, and actor minting; a new admin-only `POST /actors` finally gives each agent its own attributed key.

**Architecture:** `actors.role` already exists (migration 0000; bootstrap owner = `"admin"`, default `"member"`) with zero enforcement. Add `ForbiddenError` → 403 mapping, a `requireAdmin` middleware beside `auth`, apply it to an explicit route list, and add the minting route + a small settings card.

**Tech Stack:** Existing Hono middleware factory pattern (`src/api/auth.ts`), existing error mapping (`app.onError`), existing `createActor` service.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-12-authorization-roles-design.md`.
- Role values are the EXISTING ones: `"admin"` / `"member"`. No migration, no renames.
- Guard list (exact, per spec): `GET /settings/:key`, `PATCH /settings/:key`, `POST /knowledge/obsidian/start`, `POST /knowledge/obsidian/stop`, `POST /mcp/install`, `POST /ingest/sessions`, `POST /actors`, `GET /system/logs`. Everything else stays member-accessible (including `GET /knowledge/obsidian` and `GET /mcp/config`).
- 401 (bad key) must beat 403 (valid key, wrong role): `requireAdmin` runs after `auth`.
- The plaintext API key from `POST /actors` appears exactly once in the response; only the hash is stored; `GET /actors` never returns hashes (already true — don't regress it).
- **`src/api/app.ts` carries USER WIP right now** (unrelated aiUsage work): edit it in the working tree but NEVER `git add` it — report to the controller, who stages your hunks index-only. All other files you touch are clean; commit them normally. Stage ONLY files your task names.
- Docker PG :5433 up for the suite. Never push.

---

### Task 1: ForbiddenError + requireAdmin + guards + minting route (server)

**Files:**
- Modify: `src/services/errors.ts` (one class)
- Modify: `src/api/auth.ts` (requireAdmin)
- Modify (WORKING TREE ONLY, never commit): `src/api/app.ts` (403 mapping, guards, POST /actors)
- Test: `tests/authz.test.ts` (create)

**Interfaces:**
- Consumes: `auth` middleware pattern in `src/api/auth.ts`; `createActor` from `src/services/actors.js` (already accepts `{ name, kind, role? }`).
- Produces: `export class ForbiddenError extends Error {}` (errors.ts); `export const requireAdmin` (auth.ts) — Hono middleware; REST `POST /actors` → 201 `{ actor, apiKey }`. Task 2's UI consumes `POST /actors` and `GET /actors`.

- [ ] **Step 1: Write the failing tests**

Create `tests/authz.test.ts` — read `tests/notes-api.test.ts` first and mirror its app-bootstrap/auth-header conventions (it creates actors via `createActor` and calls `app.request`/fetch with Bearer keys). Cases:

```ts
// Pseudostructure — use the real conventions from tests/notes-api.test.ts:
// setup: adminKey = createActor({name: uniq(), kind: "human", role: "admin"}).apiKey
//        memberKey = createActor({name: uniq(), kind: "agent"}).apiKey  (role defaults member)

// 1. Each guarded route -> 403 for member, non-403 for admin:
//    GET /settings/some.key            (admin: 200 {value:null})
//    PATCH /settings/test.key          (admin: 200)
//    POST /knowledge/obsidian/start    (admin: 200 — with no vault path configured it no-ops with error field, still not 403)
//    POST /knowledge/obsidian/stop     (admin: 200)
//    POST /mcp/install {client:"bogus"} (admin: 400 — unknown client, still not 403)
//    POST /ingest/sessions {sinceDays:0} (admin: 200)
//    GET /system/logs                  (admin: 200)
//    POST /actors {name,kind:"agent"}  (admin: 201)
//    For member: ALL of the above -> 403 { error: "forbidden" }
// 2. Member work surface intact: POST /tickets (with a project) -> 201; GET /knowledge?q=x -> 200; POST /notes -> 201.
// 3. POST /actors as admin: response has actor.role "member" by default and a 48-char hex apiKey;
//    the minted key authenticates (GET /projects -> 200) and is a member (GET /system/logs -> 403).
//    POST /actors with role:"bogus" -> 400. POST /actors with role:"admin" -> 201 admin.
// 4. No key at all on a guarded route -> 401 (401 beats 403).
```

Write these as real tests with the file's conventions — every case above must exist.

- [ ] **Step 2: Run to verify failure** — `npx vitest run tests/authz.test.ts` — Expected: FAIL (no 403s, no POST /actors).

- [ ] **Step 3: Implement**

`src/services/errors.ts` — add:

```ts
export class ForbiddenError extends Error {}
```

`src/api/auth.ts` — add below `auth`:

```ts
import { ForbiddenError } from "../services/errors.js";

// Admin-only gate for routes that touch host state (settings, filesystem
// indexing, config writes, key minting). Runs after `auth`, so a bad key is
// 401 before role is ever considered.
export const requireAdmin = createMiddleware<{ Variables: { actor: Actor } }>(async (c, next) => {
  if (c.get("actor").role !== "admin") throw new ForbiddenError("forbidden");
  await next();
});
```

`src/api/app.ts` (working tree only):
- `app.onError`: add `if (err instanceof ForbiddenError) return c.json({ error: err.message }, 403);` after the AuthError line (import ForbiddenError).
- Guards — Hono per-route middleware form: change each guarded registration to include `requireAdmin` as the middleware argument, e.g.:

```ts
app.get("/settings/:key", requireAdmin, async (c) => ...);
app.patch("/settings/:key", requireAdmin, async (c) => ...);
app.post("/knowledge/obsidian/start", requireAdmin, async (c) => ...);
app.post("/knowledge/obsidian/stop", requireAdmin, async (c) => ...);
app.get("/system/logs", requireAdmin, async (c) => ...);
app.post("/ingest/sessions", requireAdmin, async (c) => ...);
```

For `/mcp/install` the registration lives in `src/api/mcp-routes.ts` — that file is CLEAN (commit normally): add `requireAdmin` to that one route only (import from `./auth.js`; the route signature there is `app.post("/mcp/install", async (c) =>` → insert the middleware).

- New route (app.ts, near the existing `GET /actors`):

```ts
app.post("/actors", requireAdmin, async (c) => {
  const { name, kind, role } = await c.req.json().catch(() => ({}));
  if (typeof name !== "string" || !name.trim()) return c.json({ error: "name required" }, 400);
  if (kind !== "human" && kind !== "agent") return c.json({ error: "kind must be human|agent" }, 400);
  if (role !== undefined && role !== "admin" && role !== "member") return c.json({ error: "role must be admin|member" }, 400);
  return c.json(await createActor({ name: name.trim(), kind, role }), 201);
});
```

(import `createActor` alongside the existing `listActors` import; import `requireAdmin` from `./auth.js`.)

- [ ] **Step 4: Run tests** — `npx vitest run tests/authz.test.ts` then FULL `npm test && npx tsc --noEmit` — all green. NOTE: `tests/mcp-http.test.ts` exercises `/mcp/install` with the bootstrap owner key (role admin) — should stay green; if any existing test used a member-role actor against a now-guarded route, fix the TEST by minting its actor with `role: "admin"` ONLY where the test's purpose is the guarded feature itself (report any such change).

- [ ] **Step 5: Commit (everything except app.ts)**

```bash
git add src/services/errors.ts src/api/auth.ts src/api/mcp-routes.ts tests/authz.test.ts
git commit -m "feat: admin role enforcement and actor key minting"
git status --short src/api/app.ts   # must still show M — controller stages it
```

Report DONE_WITH_CONCERNS noting app.ts awaits controller staging.

---

### Task 2: ActorsCard (app UI)

**Files:**
- Create: `app/src/components/settings/ActorsCard.tsx`
- Modify: `app/src/components/settings/LocalNodeTab.tsx` (mount the card — verify this file is NOT in user WIP first: `git status --short` must not list it; if it IS, create the card unwired and report)
- Modify: `app/src/api/actors.ts` (add create)
- Test: `app/src/components/settings/ActorsCard.test.tsx` (or the app's convention location)

**Interfaces:**
- Consumes: `GET /actors` → `{ id, name, kind, role }[]`; `POST /actors` `{ name, kind, role? }` → `{ actor, apiKey }`; `apiFetch` conventions.
- Produces: exported `ActorsCard` component.

- [ ] **Step 1: Extend `app/src/api/actors.ts`**

```ts
import { apiFetch } from "./client.js";
import type { Actor } from "./types.js";
export const actors = {
  list: () => apiFetch("/actors", {}) as Promise<Actor[]>,
  create: (input: { name: string; kind: "human" | "agent"; role?: "admin" | "member" }) =>
    apiFetch("/actors", { method: "POST", body: input }) as Promise<{ actor: Actor; apiKey: string }>,
};
```

Ensure the app's `Actor` type includes `role: string` (app/src/api/types.ts).

- [ ] **Step 2: Write failing component test** — following the app's component-test convention (see MCPTab.test.tsx from P12): renders the actor list from a mocked `GET /actors`; submitting the "New agent key" form calls create and then shows the returned key text with a one-time warning; a mocked 403 shows the inline error state.

- [ ] **Step 3: Implement ActorsCard** — glass-card styling like McpConnectCard: list rows (name, kind badge, role badge — NEVER any key material), "New agent key" form (name input, kind fixed "agent", role fixed "member"), on success show the returned key in a readonly input + copy button + "Store it now — it cannot be retrieved later." 403/other errors inline. Mount `<ActorsCard />` in LocalNodeTab (position: after existing content).

- [ ] **Step 4: Gates** — `cd app && npm test && npx tsc --noEmit 2>&1 | grep -vE "AIUsageTab|PlatformIntegrationCard|AIModelsTab|IntegrationsTab"` — all pass, zero errors in touched files.

- [ ] **Step 5: Commit**

```bash
git add app/src/components/settings/ActorsCard.tsx app/src/components/settings/ActorsCard.test.tsx app/src/components/settings/LocalNodeTab.tsx app/src/api/actors.ts app/src/api/types.ts
git commit -m "feat: actor key management card"
```

---

## Final steps (controller)

Stage app.ts hunks index-only (guards + onError + POST /actors — the file also carries the user's aiUsage WIP; the patch must contain ONLY the authz hunks). README security section update (roles, minting flow, per-agent MCP config via GET /mcp/config with the agent's key) — controller commits or folds into fix wave. Whole-branch review (opus — auth changes warrant it; dimensions: guard-list completeness vs spec, 401-vs-403 ordering, key exposure paths, any route added recently that should be guarded but isn't in the spec list — flag, don't silently add). Fix wave, gates, ledger + memory.
