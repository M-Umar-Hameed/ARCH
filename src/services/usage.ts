import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { aiUsageLogs, agentSessions } from "../db/schema.js";

// ponytail: ai_usage_logs only has provider/model/tokens/cost columns (see
// drizzle/0004_friendly_gorgon.sql) — there is no actorId/ticketId/ok/durationMs
// column to hold the rest of a headless-CLI call. We keep the fuller entry shape
// for call-site clarity but only persist what the table can hold: agent -> provider,
// role -> model, and an estimated token count (headless CLIs don't report real usage).
// actorId/ticketId/durationMs are accepted and dropped; ok is tracked separately via
// agent_sessions.status (see endAgentSession below).
export type UsageEntry = {
  actorId: string;
  agent: string;
  role: string;
  ticketId?: string;
  outputChars: number;
  durationMs: number;
  ok: boolean;
};

export async function logAgentUse(entry: UsageEntry): Promise<void> {
  try {
    await db.insert(aiUsageLogs).values({
      provider: entry.agent,
      model: entry.role,
      tokens: Math.round(entry.outputChars / 4), // estimated: headless CLIs report no token counts
    });
  } catch (e) {
    console.warn("logAgentUse failed:", (e as Error).message);
  }
}

// One row per forge stage execution. agent_sessions has no ticketId column, so the
// caller should fold ticket/role context into `agentName` if it wants that visible.
export async function startAgentSession(agentName: string): Promise<string | undefined> {
  try {
    const [row] = await db.insert(agentSessions)
      .values({ agentName, status: "running" })
      .returning({ id: agentSessions.id });
    return row?.id;
  } catch (e) {
    console.warn("startAgentSession failed:", (e as Error).message);
    return undefined;
  }
}

export async function endAgentSession(id: string | undefined, ok: boolean): Promise<void> {
  if (!id) return;
  try {
    await db.update(agentSessions)
      .set({ status: ok ? "passed" : "failed", updatedAt: new Date() })
      .where(eq(agentSessions.id, id));
  } catch (e) {
    console.warn("endAgentSession failed:", (e as Error).message);
  }
}
