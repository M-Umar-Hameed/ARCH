# Project Workspaces (Phase 20) — Design

Approved 2026-07-15: repo per project. Users pick which repo/folder the app
works on; forge runs against the ticket's project repo.

## Data

Migration 0007 (additive): `projects.repo_path text` (nullable). Schema +
`Project` type updated.

## API

- `PATCH /projects/:id { repoPath }` (admin): validates absolute path exists
  and is a directory; empty string clears it. Returns project + `{ isGit }`
  (`.git` presence).
- `GET /projects` rows include repoPath + isGit (computed, never-throw).
- `POST /projects/:id/git-init` (admin): arg-vector `git init` in repoPath
  (409 if already git / no repoPath). Needed because sandboxes require git.

## Forge resolution

`resolveWorkdir(ticket, config)`: ticket → project.repoPath (if set and exists)
else `config.workdir` (Inbox and legacy projects keep working unchanged).
Used at pipeline start for sandbox base, diff, promote, discard — promote and
diff endpoints resolve through the ticket's project too (they currently take
config.workdir directly — fix all call sites via one helper in runs.ts,
exported for forge-routes).

Guard: repoPath set but not a git repo → pipeline 409 with "run git init"
message (UI shows the button).

## UI

Settings → Integrations (or the projects area — anchor on where projects are
listed; check IntegrationsTab) gains per-project "Workspace folder": text
input + "Browse…" button using @tauri-apps/plugin-dialog `open({directory:true})`
(new dependency + capability entry in capabilities json — follow the pattern
of existing plugins; if the dialog plugin fails at runtime the text input
still works). Shows isGit badge; "Initialize git" button when not.
Remembering = the DB column; no extra store.

## Tests

Service/API: patch validates paths (400 non-absolute/missing), isGit computed,
git-init creates repo + 409s twice; forge: pipeline on a ticket whose project
has its own temp repo sandboxes THAT repo (assert sandbox branch exists there,
not in config.workdir); fallback path unchanged. UI: tab renders path, saves
via PATCH (mock apiFetch).
