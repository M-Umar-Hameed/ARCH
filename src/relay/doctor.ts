import { execFile } from "node:child_process";
import { basename, extname } from "node:path";
import { homedir } from "node:os";
import { promisify } from "node:util";
import { readClaudeAccount, readCodexAccount } from "../system/agents.js";
import type { RelayConfig } from "./config.js";

const execFileAsync = promisify(execFile);

const PROBE_TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 10 * 60_000;
const DEFAULT_PROBE_ARGS = ["--version"];

// Static per-CLI overrides in case a real agent's --version needs different
// flags. All four known basenames currently agree with the default; the map
// exists so a future vendor quirk is a one-line change here, not in invoke.ts.
const PROBE_ARGS: Record<string, string[]> = {
  claude: ["--version"],
  codex: ["--version"],
  agy: ["--version"],
  gemini: ["--version"],
};

// Only binaries with a KNOWN local auth file get a reader; anything else
// reports known:false rather than guessing at a file format we haven't seen.
const AUTH_READERS: Record<string, (homeDir: string) => boolean> = {
  claude: (homeDir) => readClaudeAccount(homeDir).connected,
  codex: (homeDir) => readCodexAccount(homeDir).connected,
};

export type ProbeStatus = { ok: boolean; error?: string; spawnFailed?: boolean };
export type AuthStatus = { known: boolean; connected: boolean | null };
export type AgentDoctorStatus = {
  name: string; binary: string; probe: ProbeStatus; auth: AuthStatus; lastChecked: string;
};

function binBasename(cmd0: string): string {
  const b = basename(cmd0);
  const ext = extname(b);
  return ext ? b.slice(0, -ext.length) : b;
}

// Never touches agent.cmd's real template (which carries {prompt}/{promptFile}/
// {model}) -- only cmd0 plus a static, per-basename --version-style arg vector.
// This is what keeps the probe from ever sending a paid prompt.
async function probeBinary(cmd0: string): Promise<ProbeStatus> {
  const bin = binBasename(cmd0);
  const args = PROBE_ARGS[bin] ?? DEFAULT_PROBE_ARGS;
  try {
    await execFileAsync(cmd0, args, { timeout: PROBE_TIMEOUT_MS, windowsHide: true });
    return { ok: true };
  } catch (e) {
    const err = e as NodeJS.ErrnoException & { stderr?: string };
    // execFile sets `code` to the OS error string (ENOENT, EACCES, ...) when the
    // process never started; a completed-but-nonzero exit sets `code` to the
    // numeric exit code instead. Only the former means the binary is unreachable.
    const spawnFailed = typeof err.code === "string";
    const detail = (err.stderr ?? "").trim();
    return { ok: false, error: detail || err.message, spawnFailed };
  }
}

function checkAuth(cmd0: string, homeDir: string): AuthStatus {
  const reader = AUTH_READERS[binBasename(cmd0)];
  if (!reader) return { known: false, connected: null };
  try {
    return { known: true, connected: reader(homeDir) };
  } catch {
    return { known: true, connected: false };
  }
}

type CacheEntry = { status: AgentDoctorStatus; expiresAt: number };
const cache = new Map<string, CacheEntry>();

export async function runDoctor(
  config: RelayConfig, opts: { fresh?: boolean; homeDir?: string } = {},
): Promise<AgentDoctorStatus[]> {
  const homeDir = opts.homeDir ?? homedir();
  const now = Date.now();
  const names = Object.keys(config.agents);

  return Promise.all(names.map(async (name) => {
    const cached = cache.get(name);
    if (!opts.fresh && cached && cached.expiresAt > now) return cached.status;

    const cmd0 = config.agents[name].cmd[0];
    const probe = await probeBinary(cmd0);
    const status: AgentDoctorStatus = {
      name, binary: binBasename(cmd0), probe, auth: checkAuth(cmd0, homeDir),
      lastChecked: new Date(now).toISOString(),
    };
    cache.set(name, { status, expiresAt: now + CACHE_TTL_MS });
    return status;
  }));
}

// Cache-only reads for the pipeline-start path -- deliberately never trigger a
// fresh probe, so starting a pipeline never pays probe latency.
function cachedStatus(agentName: string): AgentDoctorStatus | undefined {
  return cache.get(agentName)?.status;
}

// Soft failures (binary ran, exited non-zero) become non-blocking warnings.
export function pipelineStartWarnings(agentNames: string[]): string[] {
  const seen = new Set<string>();
  const warnings: string[] = [];
  for (const name of agentNames) {
    if (seen.has(name)) continue;
    seen.add(name);
    const s = cachedStatus(name);
    if (s && !s.probe.ok) warnings.push(`agent "${name}" (${s.binary}): ${s.probe.error ?? "probe failed"}`);
  }
  return warnings;
}

// Hard failures (binary couldn't be spawned at all) block pipeline start --
// starting a run against a renamed/missing binary would just stall mid-run.
export function pipelineStartBlockingError(agentNames: string[]): string | null {
  const seen = new Set<string>();
  for (const name of agentNames) {
    if (seen.has(name)) continue;
    seen.add(name);
    const s = cachedStatus(name);
    if (s && !s.probe.ok && s.probe.spawnFailed) {
      return `agent "${name}" (${s.binary}) cannot be spawned: ${s.probe.error ?? "spawn failed"}`;
    }
  }
  return null;
}
