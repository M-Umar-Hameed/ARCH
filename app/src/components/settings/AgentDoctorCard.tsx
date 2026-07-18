import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api.js";

type DoctorStatus = {
  name: string; binary: string;
  probe: { ok: boolean; error?: string };
  auth: { known: boolean; connected: boolean | null };
  lastChecked: string;
};

function dotColor(s: DoctorStatus): string {
  return s.probe.ok ? "bg-green-500" : "bg-red-500";
}

function authLabel(s: DoctorStatus): string {
  if (!s.auth.known) return "auth: unknown";
  return s.auth.connected ? "auth: connected" : "auth: not connected";
}

export function AgentDoctorCard() {
  const queryClient = useQueryClient();

  const { data, isFetching } = useQuery({
    queryKey: ["forge", "doctor"],
    queryFn: () => api.get("/forge/doctor") as Promise<DoctorStatus[]>,
  });

  const runChecks = async () => {
    const fresh = await api.get("/forge/doctor?fresh=true") as DoctorStatus[];
    queryClient.setQueryData(["forge", "doctor"], fresh);
  };

  const statuses = Array.isArray(data) ? data : [];

  return (
    <div className="glass-card rounded-xl border border-white/10 p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-headline-sm text-on-surface font-bold flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-xl">monitor_heart</span>
            Agent Health
          </h3>
          <p className="text-xs text-on-surface-variant mt-1">
            Cheap --version probe per configured relay agent, cached for 10 minutes. Never sends a real prompt.
          </p>
        </div>
        <button
          onClick={runChecks}
          disabled={isFetching}
          className="px-4 py-2 rounded bg-surface-container-highest hover:bg-white/10 text-on-surface text-xs font-bold uppercase tracking-widest transition-all disabled:opacity-50 cursor-pointer"
        >
          Run checks
        </button>
      </div>

      <div className="space-y-2">
        {statuses.length === 0 ? (
          <div className="text-on-surface-variant font-code-sm text-sm">No relay agents configured.</div>
        ) : (
          statuses.map(s => (
            <div key={s.name} className="flex items-center justify-between gap-4 border border-white/5 rounded-lg px-4 py-3">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${dotColor(s)}`} />
                <span className="text-sm font-medium text-on-surface">{s.name}</span>
                <span className="text-xs text-on-surface-variant">({s.binary})</span>
              </div>
              <div className="text-right text-xs text-on-surface-variant">
                <div>{authLabel(s)}</div>
                {!s.probe.ok && <div className="text-error">{s.probe.error}</div>}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
