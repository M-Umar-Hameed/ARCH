import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileHash } from "../../services/knowledge.js";
import type { SessionSource, SessionDoc } from "./source.js";

export function makeClaudeMemSource(
  dbPath = join(homedir(), ".claude-mem", "claude-mem.db"),
): SessionSource {
  return {
    source: "claude-mem",
    async listSessionDocs(sinceDays: number): Promise<SessionDoc[]> {
      if (!existsSync(dbPath)) return [];
      const { DatabaseSync } = await import("node:sqlite");
      let db;
      try {
        db = new DatabaseSync(dbPath, { readOnly: true });
      } catch (e) {
        console.warn(`claude-mem db unreadable, skipping: ${(e as Error).message}`);
        return [];
      }
      try {
        const cutoff = Date.now() - sinceDays * 24 * 3600 * 1000;
        const rows = db.prepare(
          "select id, title, narrative, facts, concepts, project from observations where created_at_epoch >= ? order by id",
        ).all(cutoff) as { id: number; title: string | null; narrative: string | null; facts: string | null; concepts: string | null; project: string | null }[];
        return rows.map((r) => {
          const text = [r.project && `project: ${r.project}`, r.title, r.narrative, r.facts, r.concepts]
            .filter(Boolean).join("\n");
          return { ref: `claude-mem#${r.id}`, text, hash: fileHash(text) };
        });
      } catch (e) {
        console.warn(`claude-mem query failed, skipping: ${(e as Error).message}`);
        return [];
      } finally {
        db.close();
      }
    },
  };
}
