import { pathToFileURL } from "node:url";
import { getEmbedder } from "../../knowledge/embedder.js";
import { ingestSessions } from "./ingest.js";
import { makeClaudeMemSource } from "./claude-mem.js";
import { makeClaudeCodeSource } from "./claude-code.js";
import { makeCodexSource } from "./codex.js";
import { makeAntigravitySource } from "./antigravity.js";

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const sinceDays = Number(process.env.SESSIONS_SINCE_DAYS ?? 30);
  const result = await ingestSessions([makeClaudeMemSource(), makeClaudeCodeSource(), makeCodexSource(), makeAntigravitySource()], getEmbedder(), sinceDays);
  console.log(JSON.stringify(result));
}
