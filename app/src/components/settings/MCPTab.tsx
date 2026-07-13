import { McpConnectCard } from "./McpConnectCard.js";

export function MCPTab() {
  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="mb-8 border-b border-white/10 pb-6">
        <h2 className="font-headline-md text-headline-md text-on-surface mb-2">Model Context Protocol (MCP)</h2>
        <p className="text-on-surface-variant text-sm max-w-2xl">
          VibeOps serves MCP — agents connect to it, not the other way around. Point Claude Code, Cursor, or Gemini at the URL below.
        </p>
      </div>

      <McpConnectCard />
    </div>
  );
}
