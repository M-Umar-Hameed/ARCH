# Coding Agents Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show, per coding agent (Claude/Codex/Antigravity), which account it's logged in as and its real token usage observed from ingested transcripts — with an honest note that provider quotas aren't visible.

**Architecture:** New `src/system/agents.ts` reads local auth files (account identity only, never secrets) and sums token counts from the same transcript files the P10 readers walk. `GET /system/agents` (admin-gated) exposes it. `AIUsageTab` renders a real Coding Agents panel and drops the fake quota mock.

**Tech Stack:** node:fs/os/path, `process.getBuiltinModule("node:sqlite")` for Antigravity (vite-node can't import node:sqlite); existing Hono/requireAdmin; React + react-query.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-13-coding-agents-panel-design.md`.
- **Secrets never leave the process.** Readers return account email + auth mode + plan ONLY — never id_token/access_token/refresh_token/API key. Never log token material. A test asserts no secret field appears in returned objects.
- Readers never throw: missing/unreadable/parse-fail → `connected:false`, tokens null.
- Token semantics: Claude = SUM per-turn `message.usage` deltas; Codex = MAX cumulative `total_token_usage.total_tokens` per file, then SUM across files; Antigravity = null.
- `GET /system/agents` is admin-gated (`requireAdmin`), like /settings and /system/logs.
- App `api.get` returns the parsed body directly — never `res.data` (the bug that blanked the other cards).
- Stage ONLY files your task names. Never push. Docker PG :5433 up.

---

### Task 1: agents reader module + REST route

**Files:**
- Create: `src/system/agents.ts`
- Modify: `src/api/app.ts` (one admin-gated route)
- Test: `tests/agents.test.ts` (create)

**Interfaces:**
- Consumes: `requireAdmin` from `./auth.js` (already imported in app.ts).
- Produces:
  - `type AgentInfo = { agent: "claude"|"codex"|"antigravity"; connected: boolean; account: string|null; plan?: string|null; authMode: string; note?: string; tokens: { inputTokens: number; outputTokens: number; totalTokens: number; sessions: number } | null }`
  - `export async function getAgents(sinceDays: number, homeDir?: string): Promise<{ sinceDays: number; agents: AgentInfo[] }>`
  - Route `GET /system/agents?sinceDays=` → `getAgents`.

- [ ] **Step 1: Write the failing tests**

Create `tests/agents.test.ts`. Build fixtures under a temp HOME:

```ts
import { expect, test } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getAgents } from "../src/system/agents.js";

function b64url(obj: object): string {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}

test("reads claude + codex accounts and sums their tokens, never leaks secrets", async () => {
  const home = mkdtempSync(join(tmpdir(), "agents-"));

  // Claude account + two transcripts with usage
  writeFileSync(join(home, ".claude.json"), JSON.stringify({
    oauthAccount: { emailAddress: "me@example.com", seatTier: "max", displayName: "Me" },
  }));
  const proj = join(home, ".claude", "projects", "p1");
  mkdirSync(proj, { recursive: true });
  writeFileSync(join(proj, "s1.jsonl"),
    JSON.stringify({ type: "assistant", message: { usage: { input_tokens: 100, output_tokens: 20 } } }) + "\n" +
    JSON.stringify({ type: "assistant", message: { usage: { input_tokens: 50, output_tokens: 10 } } }));

  // Codex account (id_token with email) + rollout with cumulative token_count
  const idToken = `h.${b64url({ email: "codex@example.com" })}.s`;
  writeFileSync(join(home, ".codex", "auth.json") /* dir first */, "", { flag: "w" }); // placeholder, replaced below
  mkdirSync(join(home, ".codex", "sessions", "2026", "07", "13"), { recursive: true });
  writeFileSync(join(home, ".codex", "auth.json"), JSON.stringify({ auth_mode: "chatgpt", tokens: { id_token: idToken } }));
  writeFileSync(join(home, ".codex", "sessions", "2026", "07", "13", "r.jsonl"),
    JSON.stringify({ type: "event_msg", payload: { type: "token_count", info: { total_token_usage: { input_tokens: 900, output_tokens: 77, total_tokens: 977 } } } }) + "\n" +
    JSON.stringify({ type: "event_msg", payload: { type: "token_count", info: { total_token_usage: { input_tokens: 1200, output_tokens: 100, total_tokens: 1300 } } } }));

  const { agents } = await getAgents(30, home);
  const claude = agents.find((a) => a.agent === "claude")!;
  const codex = agents.find((a) => a.agent === "codex")!;

  expect(claude.connected).toBe(true);
  expect(claude.account).toBe("me@example.com");
  expect(claude.plan).toBe("max");
  expect(claude.tokens).toEqual({ inputTokens: 150, outputTokens: 30, totalTokens: 180, sessions: 1 });

  expect(codex.connected).toBe(true);
  expect(codex.account).toBe("codex@example.com");
  expect(codex.tokens!.totalTokens).toBe(1300); // MAX cumulative, not summed

  // Secret hygiene: no token material anywhere in the response.
  const blob = JSON.stringify(agents);
  expect(blob).not.toContain(idToken);
  expect(blob).not.toMatch(/id_token|access_token|refresh_token|api_key/i);
});

test("missing auth files → connected:false, tokens null, never throws", async () => {
  const home = mkdtempSync(join(tmpdir(), "agents-empty-"));
  const { agents } = await getAgents(30, home);
  for (const a of agents) {
    expect(a.connected).toBe(false);
    // claude/codex have no transcripts either
    if (a.agent !== "antigravity") expect(a.tokens).toEqual({ inputTokens: 0, outputTokens: 0, totalTokens: 0, sessions: 0 });
  }
});

test("token mtime window excludes old sessions", async () => {
  const home = mkdtempSync(join(tmpdir(), "agents-old-"));
  const proj = join(home, ".claude", "projects", "p");
  mkdirSync(proj, { recursive: true });
  const old = join(proj, "old.jsonl");
  writeFileSync(old, JSON.stringify({ type: "assistant", message: { usage: { input_tokens: 999, output_tokens: 999 } } }));
  const t = new Date(Date.now() - 90 * 24 * 3600 * 1000);
  utimesSync(old, t, t);
  writeFileSync(join(home, ".claude.json"), JSON.stringify({ oauthAccount: { emailAddress: "x@y.z" } }));
  const { agents } = await getAgents(7, home);
  expect(agents.find((a) => a.agent === "claude")!.tokens!.totalTokens).toBe(0);
});
```

NOTE: the Antigravity reader hits `state.vscdb` via `process.getBuiltinModule("node:sqlite")`; in the temp-HOME tests that DB won't exist under `%APPDATA%`, so antigravity returns `connected:false` — the tests above only assert claude/codex token shapes and antigravity's non-throwing default. Do NOT point the antigravity reader at homeDir (its store is under `%APPDATA%`, not HOME); it stays best-effort and is allowed to read the real machine or nothing. Keep it wrapped so a missing DB is silent.

- [ ] **Step 2: Run to verify failure** — `npx vitest run tests/agents.test.ts` — FAIL (module missing).

- [ ] **Step 3: Implement `src/system/agents.ts`**

Key pieces (write the full module; sketch of the load-bearing logic):

```ts
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type AgentTokens = { inputTokens: number; outputTokens: number; totalTokens: number; sessions: number };
export type AgentInfo = {
  agent: "claude" | "codex" | "antigravity";
  connected: boolean; account: string | null; plan?: string | null; authMode: string; note?: string;
  tokens: AgentTokens | null;
};

function decodeJwtEmail(jwt: string): string | null {
  try {
    const payload = JSON.parse(Buffer.from(jwt.split(".")[1], "base64").toString());
    return typeof payload.email === "string" ? payload.email : null;
  } catch { return null; }
}

function* walkJsonl(dir: string): Generator<string> {
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return; }
  for (const name of entries) {
    const path = join(dir, name);
    let st; try { st = statSync(path); } catch { continue; }
    if (st.isDirectory()) yield* walkJsonl(path);
    else if (name.endsWith(".jsonl")) yield path;
  }
}

// Claude: sum per-turn usage deltas across ~/.claude/projects.
function sumClaudeTokens(sinceDays: number, homeDir: string): AgentTokens {
  const dir = join(homeDir, ".claude", "projects");
  const cutoff = Date.now() - sinceDays * 24 * 3600 * 1000;
  const t: AgentTokens = { inputTokens: 0, outputTokens: 0, totalTokens: 0, sessions: 0 };
  for (const path of walkJsonl(dir)) {
    try {
      if (statSync(path).mtimeMs < cutoff) continue;
      let hit = false;
      for (const line of readFileSync(path, "utf8").split("\n")) {
        if (!line) continue;
        let d: any; try { d = JSON.parse(line); } catch { continue; }
        const u = d?.message?.usage;
        if (!u) continue;
        t.inputTokens += (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
        t.outputTokens += u.output_tokens || 0;
        hit = true;
      }
      if (hit) t.sessions++;
    } catch { /* skip file */ }
  }
  t.totalTokens = t.inputTokens + t.outputTokens;
  return t;
}

// Codex: cumulative total per rollout — take the MAX, sum across files.
function sumCodexTokens(sinceDays: number, homeDir: string): AgentTokens {
  const dir = join(homeDir, ".codex", "sessions");
  const cutoff = Date.now() - sinceDays * 24 * 3600 * 1000;
  const t: AgentTokens = { inputTokens: 0, outputTokens: 0, totalTokens: 0, sessions: 0 };
  for (const path of walkJsonl(dir)) {
    try {
      if (statSync(path).mtimeMs < cutoff) continue;
      let max = { input: 0, output: 0, total: 0 };
      for (const line of readFileSync(path, "utf8").split("\n")) {
        if (!line) continue;
        let d: any; try { d = JSON.parse(line); } catch { continue; }
        const tu = d?.payload?.type === "token_count" ? d.payload.info?.total_token_usage : null;
        if (tu && (tu.total_tokens || 0) > max.total) max = { input: tu.input_tokens || 0, output: tu.output_tokens || 0, total: tu.total_tokens || 0 };
      }
      if (max.total > 0) { t.inputTokens += max.input; t.outputTokens += max.output; t.totalTokens += max.total; t.sessions++; }
    } catch { /* skip */ }
  }
  return t;
}

function readClaudeAccount(homeDir: string): AgentInfo {
  const base: AgentInfo = { agent: "claude", connected: false, account: null, plan: null, authMode: "oauth", tokens: sumClaudeTokens(0, homeDir) };
  try {
    const j = JSON.parse(readFileSync(join(homeDir, ".claude.json"), "utf8"));
    const a = j.oauthAccount;
    if (a?.emailAddress) return { ...base, connected: true, account: a.emailAddress, plan: a.seatTier ?? null };
  } catch { /* not connected */ }
  return base;
}

function readCodexAccount(homeDir: string): AgentInfo {
  const base: AgentInfo = { agent: "codex", connected: false, account: null, authMode: "unknown", tokens: sumCodexTokens(0, homeDir) };
  try {
    const j = JSON.parse(readFileSync(join(homeDir, ".codex", "auth.json"), "utf8"));
    const email = j.tokens?.id_token ? decodeJwtEmail(j.tokens.id_token) : null;
    return { ...base, connected: !!email || !!j.OPENAI_API_KEY, account: email, authMode: j.auth_mode ?? "unknown" };
  } catch { return base; }
}

function readAntigravityAccount(): AgentInfo {
  const base: AgentInfo = { agent: "antigravity", connected: false, account: null, authMode: "oauth", note: "account not exposed locally", tokens: null };
  try {
    const { DatabaseSync } = process.getBuiltinModule("node:sqlite") as typeof import("node:sqlite");
    const dbPath = join(process.env.APPDATA ?? "", "Antigravity IDE", "User", "globalStorage", "state.vscdb");
    if (!existsSync(dbPath)) return base;
    const db = new DatabaseSync(dbPath, { readOnly: true });
    try {
      const row = db.prepare("select value from ItemTable where key='antigravityUnifiedStateSync.oauthToken'").get() as { value: string } | undefined;
      const signedIn = !!row && Buffer.from(String(row.value).replace(/[^A-Za-z0-9+/=]/g, ""), "base64").toString("latin1").includes("signedIn");
      return { ...base, connected: signedIn };
    } finally { db.close(); }
  } catch { return base; }
}

export async function getAgents(sinceDays: number, homeDir = homedir()): Promise<{ sinceDays: number; agents: AgentInfo[] }> {
  const days = Number.isFinite(sinceDays) && sinceDays >= 0 ? sinceDays : 7;
  const claude = readClaudeAccount(homeDir); claude.tokens = sumClaudeTokens(days, homeDir);
  const codex = readCodexAccount(homeDir); codex.tokens = sumCodexTokens(days, homeDir);
  const antigravity = readAntigravityAccount();
  return { sinceDays: days, agents: [claude, codex, antigravity] };
}
```

(The `sumClaudeTokens(0,...)` in the account readers is immediately overwritten in `getAgents` with the real window — keep the readers pure but let getAgents own the window. Simpler: drop tokens from the account readers and set them only in getAgents; do whichever is cleaner, keep the returned shape identical.)

- [ ] **Step 4: Run tests** — `npx vitest run tests/agents.test.ts` — PASS (3).

- [ ] **Step 5: Route in `src/api/app.ts`** (after the other `/system/*` routes):

```ts
app.get("/system/agents", requireAdmin, async (c) => {
  const { getAgents } = await import("../system/agents.js");
  const n = Number(c.req.query("sinceDays"));
  return c.json(await getAgents(Number.isFinite(n) && n >= 0 ? n : 7));
});
```

Add a `tests/agents-api.test.ts` (mirror tests/authz.test.ts bootstrap): member → 403, admin → 200 with `{ sinceDays, agents: [...] }`, keyless → 401.

- [ ] **Step 6: Full suite + typecheck** — `npm test && npx tsc --noEmit` — green.

- [ ] **Step 7: Commit**

```bash
git add src/system/agents.ts src/api/app.ts tests/agents.test.ts tests/agents-api.test.ts
git commit -m "feat: coding-agent accounts and observed token usage endpoint"
```

---

### Task 2: Coding Agents UI panel + honest empty state

**Files:**
- Modify: `app/src/components/settings/AIUsageTab.tsx`
- Test: extend the app's AIUsageTab/settings test (follow existing convention; create `AIUsageTab.test.tsx` if none).

**Interfaces:**
- Consumes: `GET /system/agents` → `{ sinceDays, agents: [{agent, connected, account, plan, authMode, note, tokens}] }` via `api.get` (returns body directly — NO `res.data`).

- [ ] **Step 1: Read the current AIUsageTab** to see the mock "PROVIDER TOKEN QUOTAS" block and the `mockUsageData`/`realUsageData` fallback.

- [ ] **Step 2: Write the failing test** — mock `api.get("/system/agents")` returning two connected agents (claude with tokens, antigravity connected tokens:null) + one disconnected; assert: account emails render; a token total renders for claude; antigravity shows "—" for tokens; the honest caption text ("aren't visible" / "observed by VibeOps") is present; a disconnected agent shows "Not connected".

- [ ] **Step 3: Implement** — add a `useQuery(["agents"], () => api.get("/system/agents"))` and render a **Coding Agents** panel:
  - Per agent row: icon + name; account line (`account` email, or the `note`/"Signed in" when connected but no email, or "Not connected"); `plan` badge when present; observed tokens (last `sinceDays`d): `totalTokens` formatted (e.g. `1.3M`, `180`), with input/output split in a subtle sub-line; `tokens===null` → "—".
  - One caption under the panel, verbatim intent: "Usage observed by VibeOps from local session logs. Provider quotas and reset limits live with each provider and aren't visible here."
  - REMOVE the fabricated per-provider quota bars + reset timers (the `mockUsageData` limit/reset UI). If you keep the `ai_usage_logs`-backed knowledge section, its empty state must say "No usage logged yet" — do NOT fall back to mock numbers.

- [ ] **Step 4: Gates** — `cd app && npm test && npx tsc --noEmit 2>&1 | grep -vE "<known unrelated WIP files if any>"` — pass; `npm run build` succeeds.

- [ ] **Step 5: README** — one line in the knowledge/usage area: the AI Models → Token Usage tab shows each coding agent's signed-in account and VibeOps-observed token usage from local session logs; provider-side quotas are not visible to VibeOps.

- [ ] **Step 6: Commit**

```bash
git add app/src/components/settings/AIUsageTab.tsx <the test file> README.md
git commit -m "feat: real Coding Agents panel with accounts and observed tokens"
```

---

## Final steps (controller)

Live check: boot dev server, `GET /system/agents` with the owner key → real accounts (claude/codex emails, antigravity signedIn) + real token sums from your machine's transcripts; confirm NO token/secret fields in the JSON. Whole-branch review (opus — reads OAuth identity off disk; dimensions: secret hygiene [no token material returned or logged], admin-gating, reader never-throws, codex MAX-not-SUM correctness, no fabricated numbers left in UI). Fix wave, gates, payload refresh, ledger + memory.
