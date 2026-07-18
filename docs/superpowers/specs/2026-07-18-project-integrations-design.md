# Per-Project Integrations (Phase 25) — Design

Owner ask 2026-07-18: the Integrations tab is too vague — with project tenants,
connections must split into PER-PROJECT bindings and GLOBAL (all-projects)
configuration.

## Model

- **Global** (settings DB, as today): account-level credentials — github.token,
  gitlab.token/baseUrl, jira.baseUrl/email/apiToken, asana.pat — plus vault,
  MCP, AI settings. Credentials live ONLY here; never per-project.
- **Per-project bindings** (new): which external thing each project maps to —
  github.repo (owner/repo), gitlab.project, jira.project, asana.projectGid,
  and the existing repoPath. Generic storage: migration 0009
  `project_settings (project_id uuid fk, key text, value text, primary key
  (project_id, key))` — flexible for future connectors, no per-connector
  columns.

## API

- `GET /projects/:id/settings` (admin) -> { key: value } map.
- `PUT /projects/:id/settings/:key { value }` (admin; empty value deletes).
  Key allowlist: github.repo, gitlab.project, jira.project, asana.projectGid
  (reject others 400 — bindings only, never credentials).

## Sync engine

Connectors today read ONE global binding (e.g. github repo owner/repo). New
behavior: the sync engine iterates all projects; for each project with a
binding for the connector, sync that binding INTO that project (external ids
already prefix per source; ticket projectId = the bound project). Global
binding remains as legacy fallback targeting the Inbox/legacy project when no
project bindings exist. Credentials always from global settings.

## UI (Integrations tab becomes project-aware via useProject)

- Active project selected: header "Connections for <project>" — cards:
  Workspace folder (existing repoPath controls scoped to this project only),
  and one binding card per connector: the binding field (e.g. owner/repo) +
  a muted "uses global credentials — set in All projects" note + configured
  state chip. No credential inputs here.
- All projects: header "Global connections" — the existing credential cards
  (GitHub PAT etc.), vault card, and the full workspaces list as today.

## Tests

project_settings CRUD + allowlist 400s + authz member 403; engine: two
projects bound to two different (fixture) repos sync into their own projects
idempotently; UI: active-project view renders binding fields and PUTs on
save, global view renders credential cards (fetch mocks).
