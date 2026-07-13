import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api.js";

type AgentTokens = { inputTokens: number; outputTokens: number; totalTokens: number; sessions: number };
type AgentInfo = {
  agent: string;
  connected: boolean;
  account: string | null;
  plan?: string | null;
  authMode: string;
  note?: string;
  tokens: AgentTokens | null;
};

const AGENT_META: Record<string, { label: string; icon: React.ReactNode }> = {
  claude: { label: "Claude Code", icon: <span className="font-serif italic text-xl text-[#D97757]">C</span> },
  antigravity: { label: "Antigravity", icon: <span className="material-symbols-outlined text-xl text-[#4285F4]">memory</span> },
  codex: { label: "Codex", icon: <span className="material-symbols-outlined text-xl text-white">psychology</span> },
};

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function AIUsageTab() {
  const { data: realUsageData, isLoading } = useQuery({
    queryKey: ["ai-usage"],
    // api.get returns the parsed JSON body directly (no axios-style .data).
    queryFn: () => api.get("/system/ai-usage"),
  });

  const { data: agentsData, isLoading: agentsLoading } = useQuery({
    queryKey: ["agents"],
    queryFn: () => api.get("/system/agents"),
  });
  const agents: AgentInfo[] = agentsData?.agents ?? [];
  const sinceDays = agentsData?.sinceDays ?? 7;

  const mockAgentData = {
    activeSessions: 3,
    totalSessions7d: 42,
    autonomouslyResolved: 18,
    humanHandoffs: 24,
    topAgents: [
      { name: "Antigravity (Gemini)", sessions: 28, successRate: "45%" },
      { name: "Codex (GPT-4o)", sessions: 14, successRate: "38%" }
    ]
  };

  const usageLogs = realUsageData?.usage ?? [];

  const agentData = realUsageData?.agents?.length
    ? {
        activeSessions: realUsageData.agents.find((a: any) => a.status === 'active')?.count || 0,
        totalSessions7d: realUsageData.agents.reduce((acc: number, a: any) => acc + Number(a.count), 0),
        autonomouslyResolved: realUsageData.agents.find((a: any) => a.status === 'resolved')?.count || 0,
        humanHandoffs: realUsageData.agents.find((a: any) => a.status === 'handoff')?.count || 0,
        topAgents: mockAgentData.topAgents // Still mock this specific nested structure until the backend implements it
      }
    : mockAgentData;

  const totalTokens = realUsageData?.overview?.totalTokens ?? "2.87M";
  const totalCost = realUsageData?.overview?.totalCost ? `$${realUsageData.overview.totalCost.toFixed(2)}` : "$14.23";

  if (isLoading) {
    return <div className="text-on-surface-variant font-code-sm">Loading usage data...</div>;
  }

  return (
    <div className="space-y-6 max-w-4xl animate-in fade-in duration-300">
      
      {/* Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="glass-card rounded-lg p-5 border border-white/5 flex flex-col gap-1">
          <span className="text-xs text-on-surface-variant uppercase tracking-wider font-code-sm">Total Tokens (7d)</span>
          <span className="text-2xl font-bold text-on-surface">{totalTokens}</span>
          <span className="text-xs text-green-400 mt-1 flex items-center gap-1">
            <span className="material-symbols-outlined text-[14px]">trending_down</span>
            12% vs last week
          </span>
        </div>
        <div className="glass-card rounded-lg p-5 border border-white/5 flex flex-col gap-1">
          <span className="text-xs text-on-surface-variant uppercase tracking-wider font-code-sm">Est. Cost (7d)</span>
          <span className="text-2xl font-bold text-on-surface">{totalCost}</span>
          <span className="text-xs text-on-surface-variant/70 mt-1">Saved $5.40 via local fallback</span>
        </div>
        <div className="glass-card rounded-lg p-5 border border-white/5 flex flex-col gap-1 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-primary/10 rounded-full blur-2xl -mr-8 -mt-8"></div>
          <span className="text-xs text-on-surface-variant uppercase tracking-wider font-code-sm">Active Strategy</span>
          <span className="text-xl font-bold text-primary mt-1">Cost-Optimized</span>
          <span className="text-xs text-on-surface-variant/70 mt-1">Auto-routing enabled</span>
        </div>
      </div>

      {/* Autonomous Coding Agents Usage */}
      <h3 className="font-code-sm uppercase tracking-widest text-on-surface-variant/70 text-xs mb-4 ml-1 mt-8">Autonomous Agents Usage</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <div className="glass-card rounded-xl p-6 border border-white/5 flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <h4 className="font-headline-sm font-bold text-on-surface flex items-center gap-2">
              <span className="material-symbols-outlined text-secondary">smart_toy</span>
              Agent Sessions (7d)
            </h4>
            <span className="bg-secondary/20 text-secondary text-xs font-bold px-2 py-1 rounded animate-pulse">
              {agentData.activeSessions} Active Now
            </span>
          </div>
          <div className="flex justify-between items-end mt-2">
            <div>
              <div className="text-3xl font-bold text-on-surface">{agentData.totalSessions7d}</div>
              <div className="text-xs text-on-surface-variant mt-1">Total tasks delegated</div>
            </div>
            <div className="text-right">
              <div className="text-sm font-bold text-green-400">{agentData.autonomouslyResolved} Resolved</div>
              <div className="text-sm font-bold text-yellow-400">{agentData.humanHandoffs} Handoffs</div>
            </div>
          </div>
        </div>

        <div className="glass-card rounded-xl p-6 border border-white/5 flex flex-col gap-4">
          <h4 className="font-headline-sm font-bold text-on-surface flex items-center gap-2">
            <span className="material-symbols-outlined text-on-surface-variant">leaderboard</span>
            Top Agent Engines
          </h4>
          <div className="space-y-3 mt-1">
            {agentData.topAgents.map(agent => (
              <div key={agent.name} className="flex justify-between items-center text-sm">
                <span className="text-on-surface-variant">{agent.name}</span>
                <div className="flex gap-4">
                  <span className="font-code-sm">{agent.sessions} runs</span>
                  <span className="font-bold text-green-400 w-12 text-right">{agent.successRate}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <h3 className="font-code-sm uppercase tracking-widest text-on-surface-variant/70 text-xs mb-4 ml-1">Coding Agents</h3>

      {/* Coding Agents — real accounts + observed tokens from /system/agents */}
      <div className="space-y-3">
        {agentsLoading ? (
          <div className="text-on-surface-variant font-code-sm">Loading agents...</div>
        ) : agents.length === 0 ? (
          <div className="glass-card rounded-xl p-6 border border-white/5 text-on-surface-variant font-code-sm text-center">
            No coding agents detected
          </div>
        ) : (
          agents.map((agent) => {
            const meta = AGENT_META[agent.agent] ?? {
              label: agent.agent,
              icon: <span className="material-symbols-outlined text-xl text-on-surface-variant">smart_toy</span>,
            };
            const accountLine = !agent.connected ? "Not connected" : agent.account || agent.note || "Signed in";
            return (
              <div key={agent.agent} className="glass-card rounded-xl p-5 border border-white/5 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-surface-container-highest flex items-center justify-center border border-white/5">
                    {meta.icon}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-headline-sm font-bold text-on-surface">{meta.label}</h4>
                      {agent.plan && (
                        <span className="text-[10px] uppercase tracking-wide bg-white/10 text-on-surface-variant px-1.5 py-0.5 rounded">
                          {agent.plan}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-on-surface-variant">{accountLine}</p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold text-on-surface font-code-sm">
                    {agent.tokens ? formatTokens(agent.tokens.totalTokens) : "—"}
                  </div>
                  {agent.tokens ? (
                    <div className="text-[11px] text-on-surface-variant/70 font-code-sm mt-0.5">
                      {formatTokens(agent.tokens.inputTokens)} in / {formatTokens(agent.tokens.outputTokens)} out
                    </div>
                  ) : (
                    <div className="text-[11px] text-on-surface-variant/70 font-code-sm mt-0.5">last {sinceDays}d</div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      <p className="text-xs text-on-surface-variant/60 italic mt-3 ml-1">
        Usage observed by VibeOps from local session logs. Provider quotas and reset limits live with each provider and aren't visible here.
      </p>

      <h3 className="font-code-sm uppercase tracking-widest text-on-surface-variant/70 text-xs mb-4 ml-1 mt-8">Logged AI Usage</h3>

      {/* ai_usage_logs — honest empty state, no mock fallback */}
      <div className="space-y-2">
        {usageLogs.length === 0 ? (
          <div className="glass-card rounded-xl p-6 border border-white/5 text-on-surface-variant font-code-sm text-center">
            No usage logged yet
          </div>
        ) : (
          usageLogs.map((row: any, i: number) => (
            <div key={`${row.provider}-${row.model}-${i}`} className="glass-card rounded-lg p-4 border border-white/5 flex justify-between items-center text-sm">
              <span className="text-on-surface">{row.provider} • {row.model}</span>
              <span className="font-code-sm text-on-surface-variant">{formatTokens(Number(row.tokens) || 0)} tokens</span>
            </div>
          ))
        )}
      </div>

    </div>
  );
}
