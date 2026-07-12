# One-Click MCP Config (Design Spec)

## Context

Agents (Claude Code, Cursor, Gemini CLI) should connect to VibeOps over MCP without hand-editing config files. Today the MCP server is stdio-only (`npm run mcp`, needs `TICKETS_API_KEY`), which has two problems for the installed app: the payload does not ship an MCP entry point, and — decisive — PGlite is single-process, so a spawned stdio MCP process would fight the running sidecar for the embedded database.

Decided autonomously with documented assumptions (user delegated).

## Decision summary

- **MCP over streamable HTTP on the existing sidecar.** Mount the existing `buildServer()` tool set at `POST/GET/DELETE /mcp` on the Hono app via the MCP SDK's `StreamableHTTPServerTransport` (stateless mode: fresh transport per request, `sessionIdGenerator: undefined`). No second process, no PGlite contention, works the moment the app is running. Auth = the same per-actor bearer key middleware every other route uses.
- **`GET /mcp/config`** returns ready-to-use connection material for each client: the URL, and per-client — Claude Code: the exact `claude mcp add --transport http vibeops http://127.0.0.1:8787/mcp --header "Authorization: Bearer <key>"` command; Cursor: the JSON snippet for `~/.cursor/mcp.json`; Gemini CLI: the JSON snippet for `~/.gemini/settings.json`. The key echoed is the caller's own (the one presented in the Authorization header), never another actor's.
- **`POST /mcp/install` `{ client: "cursor" | "gemini" }`** performs the one-click write for clients whose config lives in a dedicated/mergeable file: read the existing JSON (or start empty), merge in the `vibeops` server entry non-destructively, write back, after saving a one-time `<file>.vibeops-backup` copy of the pre-existing file. Claude Code is deliberately NOT file-written: `~/.claude.json` is a large live file owned by the CLI; we return the `claude mcp add` command instead (config endpoint above). Codex (TOML) deferred.
- **UI:** one new standalone component file `app/src/components/settings/McpConnectCard.tsx` (buttons: install for Cursor / Gemini, copy-command for Claude Code, backed by the two endpoints). It is NOT wired into any existing screen — the user is actively restyling the settings tabs, and touching their WIP files risks conflicts; they import the card where they want it. This keeps "one-click" deliverable without collisions.

## Approaches considered

1. **HTTP MCP on the sidecar + config writers (chosen).** Zero extra processes, config is just URL+header, single-process PGlite constraint respected.
2. **Bundle a stdio MCP entry (`mcp.mjs`) into the payload and write configs that spawn it.** Disqualified: while the desktop app runs, the stdio process cannot open the embedded PGlite data dir (single-process lock) — exactly the situation one-click users would be in.
3. **Docs/snippets only.** No file writes, no risk — but not one-click; kept as the fallback for Claude Code where writing the live config file is riskier than the command.

## Component changes

- `src/mcp/server.ts` — no tool changes. `buildServer(apiKey)` is reused as-is by the HTTP mount.
- `src/api/app.ts` — new routes (behind the existing auth middleware):
  - `ALL /mcp`: extract the bearer key, `buildServer(key)`, connect a stateless `StreamableHTTPServerTransport`, delegate to `transport.handleRequest(c.env.incoming, c.env.outgoing, body)`, return `RESPONSE_ALREADY_SENT` (@hono/node-server helper for raw-res handlers). NOTE: this route only works under the node-server runtime (the sidecar and dev server both are); the app-level tests that call `app.fetch` directly cannot exercise it — tested over real HTTP instead.
  - `GET /mcp/config`: pure function of (port, caller's key) → `{ url, claudeCode: { command }, cursor: { path, snippet }, gemini: { path, snippet } }`.
  - `POST /mcp/install`: body `{ client }`; merge-write as above; returns `{ path, backedUp }`. Errors: unknown client → 400; unwritable path → 500 with message.
- `src/mcp/clients.ts` (new) — the pure config-snippet builders and the merge-write logic (`installClientConfig(client, url, key, homeDirOverride?)`), unit-testable with a temp home.
- `app/src/components/settings/McpConnectCard.tsx` (new, unwired) — fetches `/mcp/config`, renders the three options; Cursor/Gemini buttons POST `/mcp/install`; Claude Code shows the command with a copy button.
- `README.md` — "Connect an agent (MCP)" section: one-click from the app, or curl the endpoints, or the legacy stdio `npm run mcp` for external-Postgres setups.

## Config formats written

- Cursor `~/.cursor/mcp.json`: `{ "mcpServers": { "vibeops": { "url": "http://127.0.0.1:8787/mcp", "headers": { "Authorization": "Bearer <key>" } } } }` (merged into existing `mcpServers`).
- Gemini `~/.gemini/settings.json`: `{ "mcpServers": { "vibeops": { "httpUrl": "http://127.0.0.1:8787/mcp", "headers": { "Authorization": "Bearer <key>" } } } }` (merged; file may hold unrelated settings — preserve them).
- Existing `vibeops` entries are overwritten (re-install updates the key/port); other entries never touched.

## Error handling

- `/mcp` without/with bad key: same 401 path as every route (middleware runs first).
- Malformed JSON in an existing client config file: abort the install with a 409-style error naming the file — never clobber a file we cannot parse; the backup is only written when we CAN parse and merge.
- The sidecar binds loopback in embedded mode, so `/mcp` and the install endpoints are not LAN-reachable; keys written into client configs are plaintext, same trust level as `~/.vibeops/credentials.json` (documented).

## Testing

- Unit (`src/mcp/clients.ts`): snippet builders exact-match; merge-write into empty home, into existing file with unrelated keys (preserved), into corrupt JSON (rejected, untouched, no backup).
- HTTP integration: boot the real server on an ephemeral port (embedded temp home, like tests/sidecar-payload.test.ts) and drive a real MCP handshake: `initialize` + `tools/list` over `POST /mcp` with the bearer key; assert the 7 tools are listed; assert 401 without key.
- `POST /mcp/install` with `HOME` pointed at a temp dir: file created with expected content.

## Out of scope

- Codex/TOML clients; project-scoped (`.mcp.json`) installs; wiring the card into the settings tabs (user's WIP); MCP resources/prompts; OAuth; session-stateful streamable transport.
