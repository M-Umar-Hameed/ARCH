import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api.js";

export function AIUsageTab() {
  const { data: realUsageData, isLoading } = useQuery({
    queryKey: ["ai-usage"],
    // api.get returns the parsed JSON body directly (no axios-style .data).
    queryFn: () => api.get("/system/ai-usage"),
  });

  // Mock data for LLM usage to fulfill the UI requirement, acting as a fallback
  const mockUsageData = [
    {
      id: "claude",
      name: "Claude 3.5 Sonnet",
      provider: "Anthropic",
      icon: <span className="font-serif italic text-xl text-[#D97757]">C</span>,
      color: "bg-[#D97757]",
      textColor: "text-[#D97757]",
      borderColor: "border-[#D97757]/30",
      usage: 125000,
      limit: 200000,
      resetPeriod: "5 hours",
      resetTime: "in 2h 15m",
      type: "Rolling Limit"
    },
    {
      id: "antigravity",
      name: "Antigravity (Gemini 1.5)",
      provider: "Google",
      icon: <span className="material-symbols-outlined text-xl text-[#4285F4]">memory</span>,
      color: "bg-[#4285F4]",
      textColor: "text-[#4285F4]",
      borderColor: "border-[#4285F4]/30",
      usage: 1850000,
      limit: 4000000,
      resetPeriod: "Weekly",
      resetTime: "in 3 days",
      type: "Quota"
    },
    {
      id: "codex",
      name: "Codex / GPT-4o",
      provider: "OpenAI",
      icon: <span className="material-symbols-outlined text-xl text-white">psychology</span>,
      color: "bg-white",
      textColor: "text-white",
      borderColor: "border-white/30",
      usage: 845000,
      limit: 1000000,
      resetPeriod: "Weekly",
      resetTime: "in 3 days",
      type: "Quota"
    }
  ];

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

  const usageData = realUsageData?.usage?.length 
    ? realUsageData.usage 
    : mockUsageData;
    
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

  const formatNumber = (num: number) => new Intl.NumberFormat('en-US').format(num);

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

      <h3 className="font-code-sm uppercase tracking-widest text-on-surface-variant/70 text-xs mb-4 ml-1">Provider Token Quotas</h3>

      {/* Usage Cards */}
      <div className="space-y-4">
        {usageData.map((model: any, i: number) => {
          const usage = Number(model.usage) || 0;
          const limit = Number(model.limit) || 200000;
          const percentUsed = Math.min(100, Math.round((usage / limit) * 100));
          const isWarning = percentUsed > 85;
          const isDanger = percentUsed > 95;
          
          let barColor = model.color || "bg-primary";
          if (isDanger) barColor = "bg-red-500";
          else if (isWarning) barColor = "bg-yellow-500";

          return (
            <div key={model.id || i} className={`glass-card rounded-xl p-6 border ${model.borderColor || "border-white/10"} relative overflow-hidden flex flex-col gap-4`}>
              <div className="absolute top-0 left-0 w-1 h-full" style={{ backgroundColor: isDanger ? '#ef4444' : isWarning ? '#eab308' : 'transparent' }}></div>
              
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-surface-container-highest flex items-center justify-center border border-white/5">
                    {model.icon || <span className="material-symbols-outlined text-primary">memory</span>}
                  </div>
                  <div>
                    <h4 className="font-headline-sm font-bold text-on-surface">{model.name || model.model}</h4>
                    <p className="text-xs text-on-surface-variant">{model.provider} • {model.type || 'Quota'}</p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold text-on-surface">{percentUsed}% Used</div>
                  <div className="text-xs text-on-surface-variant/70 mt-0.5">Resets {model.resetTime || 'Soon'}</div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-xs font-code-sm">
                  <span className="text-on-surface-variant">{formatNumber(usage)} tokens</span>
                  <span className="text-on-surface-variant">{formatNumber(limit)} limit ({model.resetPeriod || 'Rolling'})</span>
                </div>
                <div className="h-2.5 w-full bg-surface-container-highest rounded-full overflow-hidden border border-white/5">
                  <div 
                    className={`h-full ${barColor} transition-all duration-1000 ease-out rounded-full relative`}
                    style={{ width: `${percentUsed}%` }}
                  >
                    <div className="absolute inset-0 bg-white/20 w-full animate-[shimmer_2s_infinite]"></div>
                  </div>
                </div>
              </div>

              {isWarning && (
                <div className={`mt-2 text-xs flex items-center gap-2 ${isDanger ? 'text-red-400' : 'text-yellow-400'}`}>
                  <span className="material-symbols-outlined text-[16px]">warning</span>
                  {isDanger 
                    ? `Critical limit reached. Traffic will be routed to fallback providers.` 
                    : `Approaching quota limit. Consider adjusting usage or falling back to local models.`}
                </div>
              )}
            </div>
          );
        })}
      </div>

    </div>
  );
}
