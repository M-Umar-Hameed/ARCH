import { expect, test } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeClaudeMemSource } from "../src/ingest/sessions/claude-mem.js";

async function createFixtureDb(dir: string): Promise<string> {
  // Import node:sqlite only inside the function to avoid vitest collection issues
  const { DatabaseSync } = await (async () => {
    try {
      return await import("node:sqlite");
    } catch (e) {
      console.error("Failed to import node:sqlite:", e);
      throw e;
    }
  })();
  const dbPath = join(dir, "claude-mem.db");
  const db = new DatabaseSync(dbPath);
  db.exec(`create table observations (
    id integer primary key, title text, narrative text, facts text, concepts text,
    project text, created_at_epoch integer)`);
  const now = Date.now();
  const ins = db.prepare("insert into observations (id,title,narrative,facts,concepts,project,created_at_epoch) values (?,?,?,?,?,?,?)");
  ins.run(1, "Fixed auth bug", "Token check used < not <=", '["fact-a"]', '["auth"]', "proj", now);
  ins.run(2, "Old work", "ancient", null, null, "proj", now - 90 * 24 * 3600 * 1000);
  db.close();
  return dbPath;
}

test("claude-mem source lists windowed observation docs; absent db yields empty", async () => {
  const dir = mkdtempSync(join(tmpdir(), "cmem-"));
  const dbPath = await createFixtureDb(dir);
  const src = makeClaudeMemSource(dbPath);
  const docs = await src.listSessionDocs(30);
  expect(docs).toHaveLength(1); // 90-day-old row excluded
  expect(docs[0].ref).toBe("claude-mem#1");
  expect(docs[0].text).toContain("Fixed auth bug");
  expect(docs[0].text).toContain("Token check");
  expect(docs[0].hash).toHaveLength(64);

  const none = makeClaudeMemSource(join(dir, "missing.db"));
  expect(await none.listSessionDocs(30)).toEqual([]);
  rmSync(dir, { recursive: true, force: true });
});
