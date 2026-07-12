# Default VibeOps Vault Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fresh installs get a working markdown vault out of the box: `~/.vibeops/vault/` created at bootstrap with a starter note, used as the default watcher path, indexed automatically from boot.

**Architecture:** One resolution helper (`resolveVaultPath`) in `src/ingest/watch.ts`; bootstrap creates+seeds the dir; `server.ts` fire-and-forgets `startWatcher()` after settings apply. Entire watcher pipeline reused untouched.

**Tech Stack:** node:fs/os/path; existing watcher/bootstrap/settings.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-13-default-vault-design.md`.
- Resolution: explicit `customPath` arg > `obsidian.vault_path` setting > `~/.vibeops/vault` default. `startWatcher` mkdirs the DEFAULT path only (never an explicitly configured one).
- Auto-start must never block or crash boot (fire-and-forget; `startWatcher` never throws — it records `lastError`).
- Bootstrap vault creation runs BEFORE the existing-actors early return (pre-existing installs get the dir too); the starter `README.md` is written only if absent.
- Stage ONLY files your task names. Never push. Docker PG :5433 up.

---

### Task 1: resolveVaultPath + bootstrap seed + boot auto-start

**Files:**
- Modify: `src/ingest/watch.ts` (helper + use it in `getVaultStatus`/`startWatcher`)
- Modify: `src/bootstrap.ts`
- Modify: `src/api/server.ts` (one line + import)
- Test: `tests/default-vault.test.ts` (create)

**Interfaces:**
- Produces: `export async function resolveVaultPath(homeDir?: string): Promise<string>` in watch.ts; `export function defaultVaultPath(homeDir?: string): string` (pure, used by resolveVaultPath and bootstrap). Task 2 asserts the payload behavior.

- [ ] **Step 1: Write the failing tests**

Create `tests/default-vault.test.ts`:

```ts
import { expect, test } from "vitest";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runBootstrap } from "../src/bootstrap.js";
import { defaultVaultPath, resolveVaultPath } from "../src/ingest/watch.js";
import { setSetting } from "../src/services/settings.js";
import { db } from "../src/db/client.js";
import { settings } from "../src/db/schema.js";
import { eq } from "drizzle-orm";

test("bootstrap creates the vault dir with a starter note and never clobbers it", async () => {
  const home = mkdtempSync(join(tmpdir(), "vibeops-vault-"));
  await runBootstrap(18999, home);
  const starter = join(home, "vault", "README.md");
  expect(existsSync(starter)).toBe(true);
  expect(readFileSync(starter, "utf8")).toContain("VibeOps");

  writeFileSync(starter, "my edited note");
  await runBootstrap(18999, home); // second run: idempotent, no clobber
  expect(readFileSync(starter, "utf8")).toBe("my edited note");
});

test("resolveVaultPath: setting wins, default otherwise", async () => {
  // Ensure no leftover setting from other tests, then check the default.
  await db.delete(settings).where(eq(settings.key, "obsidian.vault_path"));
  const home = mkdtempSync(join(tmpdir(), "vibeops-home-"));
  expect(await resolveVaultPath(home)).toBe(join(home, ".vibeops", "vault"));
  expect(defaultVaultPath(home)).toBe(join(home, ".vibeops", "vault"));

  await setSetting("obsidian.vault_path", "D:/some/external/vault");
  try {
    expect(await resolveVaultPath(home)).toBe("D:/some/external/vault");
  } finally {
    await db.delete(settings).where(eq(settings.key, "obsidian.vault_path"));
  }
});
```

NOTE: `runBootstrap`'s `dir` param is the `.vibeops` dir itself in current code (`~/.vibeops`); the vault goes at `join(dir, "vault")` — but `defaultVaultPath(homeDir)` computes `join(homeDir, ".vibeops", "vault")` from a HOME. Keep both signatures coherent: bootstrap receives the `.vibeops` dir and does `join(dir, "vault")`; the first test passes the temp dir AS the .vibeops dir, so the starter is at `<home>/vault/README.md` as written above.

- [ ] **Step 2: Run to verify failure** — `npx vitest run tests/default-vault.test.ts` — FAIL (exports missing).

- [ ] **Step 3: Implement**

`src/ingest/watch.ts` — add near the top (homedir already imported? check; add if not):

```ts
export function defaultVaultPath(homeDir = homedir()): string {
  return join(homeDir, ".vibeops", "vault");
}

// Resolution chain: explicit path (caller) > configured setting > default vault.
export async function resolveVaultPath(homeDir?: string): Promise<string> {
  return (await getSetting("obsidian.vault_path")) ?? defaultVaultPath(homeDir);
}
```

`getVaultStatus`: replace `vaultPath: vaultPath ?? (await getSetting("obsidian.vault_path"))` with `vaultPath: vaultPath ?? (await resolveVaultPath())`.

`startWatcher`: replace the dir resolution:

```ts
const dir = customPath ?? await resolveVaultPath();
// The default vault may not exist yet outside embedded bootstrap (external-PG
// mode); create it. Never create explicitly configured paths — typos should
// surface as errors, not empty vaults.
if (dir === defaultVaultPath()) mkdirSync(dir, { recursive: true });
```

(the old `if (!dir) { lastError = "No vault path configured"; return; }` becomes unreachable — remove it; import `mkdirSync` from node:fs.)

`src/bootstrap.ts` — before the existing-actors early return:

```ts
  // The default vault (human markdown, auto-indexed) lives inside the backup
  // unit. Created every boot so pre-vault installs pick it up; the starter
  // note is seeded once and never overwritten.
  try {
    const vaultDir = join(dir, "vault");
    mkdirSync(vaultDir, { recursive: true });
    const starter = join(vaultDir, "README.md");
    if (!existsSync(starter)) {
      writeFileSync(starter,
        "# VibeOps Vault\n\nDrop markdown files here — VibeOps indexes them into knowledge search automatically.\n" +
        "Open this folder as an Obsidian vault if you use Obsidian; any editor works.\n");
    }
  } catch (e) {
    console.warn(`could not prepare default vault: ${(e as Error).message}`);
  }
```

(add `existsSync` to the fs import.)

`src/api/server.ts` — after `await applyEnvSettings();`:

```ts
import { startWatcher } from "../ingest/watch.js";
// ...
// Vault indexing is on by default; never blocks or crashes boot.
void startWatcher().catch((e) => console.warn(`vault watcher failed to start: ${(e as Error).message}`));
```

- [ ] **Step 4: Run tests** — new file passes; then FULL `npm test && npx tsc --noEmit` — green. Watch for: tests that boot the server (mcp-http) now also start a watcher against the temp home's default vault — empty dir, near-instant, must stay green; if a test hangs on an open chokidar handle, the spawned-process tests are unaffected (child killed), and in-process tests don't call startWatcher.

- [ ] **Step 5: Commit**

```bash
git add src/ingest/watch.ts src/bootstrap.ts src/api/server.ts tests/default-vault.test.ts
git commit -m "feat: default vault at ~/.vibeops/vault with boot auto-indexing"
```

---

### Task 2: Payload assertion + README

**Files:**
- Modify: `tests/sidecar-payload.test.ts` (one assertion)
- Modify: `README.md`

- [ ] **Step 1:** In tests/sidecar-payload.test.ts, after the existing 401/credentials assertions, add: `expect(existsSync(join(home, ".vibeops", "vault", "README.md"))).toBe(true);` (adjust to the test's actual temp-home variable — read the file; imports may need existsSync/join). This proves bootstrap-seeded vault + the bundled payload agree.
- [ ] **Step 2:** README: in the standalone quick-start section, add a short "Your vault" paragraph: `~/.vibeops/vault` is created on first run and indexed automatically; drop `.md`/`.pdf` files in, or open it as an Obsidian vault; point `obsidian.vault_path` (Settings → Integrations) at any external vault instead — the setting always wins over the default. Update the ingest:watch bullet if it implies a vault path is required.
- [ ] **Step 3:** Run: `npx vitest run tests/sidecar-payload.test.ts` (rebuilds payload — the new server.ts auto-start ships in it) — PASS with the new assertion.
- [ ] **Step 4: Commit**

```bash
git add tests/sidecar-payload.test.ts README.md
git commit -m "feat: prove default vault in the packaged payload; document it"
```

---

## Final steps (controller)

Live check with fresh temp home: `GET /knowledge/obsidian` → default path + isRunning true; drop an .md → indexedCount rises. Whole-branch review (sonnet — small, reuses proven pipeline; dimensions: mkdir-only-default rule, no boot blocking, no clobber). Fix wave, gates, payload refresh, ledger + memory.
