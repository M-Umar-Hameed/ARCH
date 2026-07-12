import { expect, test } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeCodexSource } from "../src/ingest/sessions/codex.js";

function rolloutLine(payload: object, type = "event_msg"): string {
  return JSON.stringify({ timestamp: new Date().toISOString(), type, payload });
}

test("codex reader extracts user/agent messages only, skips noise and old files", async () => {
  const root = mkdtempSync(join(tmpdir(), "codex-"));
  const day = join(root, "2026", "07", "12");
  mkdirSync(day, { recursive: true });

  const lines = [
    rolloutLine({ type: "user_message", message: "please fix the login bug" }),
    rolloutLine({ type: "agent_message", message: "I will inspect the auth module." }),
    rolloutLine({ type: "task_started" }),
    rolloutLine({ type: "reasoning", text: "secret chain of thought" }, "response_item"),
    rolloutLine({ type: "message", role: "developer", content: [{ type: "input_text", text: "instruction dump" }] }, "response_item"),
    "{not json",
    rolloutLine({ type: "token_count", count: 5 }),
  ];
  writeFileSync(join(day, "rollout-1.jsonl"), lines.join("\n"));

  // A file older than the window must be skipped.
  const oldDay = join(root, "2026", "01", "01");
  mkdirSync(oldDay, { recursive: true });
  const oldFile = join(oldDay, "rollout-old.jsonl");
  writeFileSync(oldFile, rolloutLine({ type: "user_message", message: "ancient" }));
  const old = new Date(Date.now() - 90 * 24 * 3600 * 1000);
  utimesSync(oldFile, old, old);

  const docs = await makeCodexSource(root).listSessionDocs(30);
  expect(docs).toHaveLength(1);
  expect(docs[0].ref).toBe(join(day, "rollout-1.jsonl"));
  expect(docs[0].text).toBe("please fix the login bug\n\nI will inspect the auth module.");
  expect(docs[0].hash).toMatch(/^[0-9a-f]{64}$/);
});

test("codex reader returns [] for a missing root", async () => {
  expect(await makeCodexSource(join(tmpdir(), "nope-codex")).listSessionDocs(30)).toEqual([]);
});
