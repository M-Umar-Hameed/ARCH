import { serve } from "@hono/node-server";
import { app } from "./app.js";
import { isEmbedded } from "../db/client.js";
import { runBootstrap } from "../bootstrap.js";
import { ensureIndex } from "../db/vector-setup.js";

const port = Number(process.env.PORT ?? 8787);
if (isEmbedded) {
  await ensureIndex();
  const { bootstrapped } = await runBootstrap(port);
  if (bootstrapped) console.log("first run: created Inbox project + owner key -> ~/.vibeops/credentials.json");
}
serve({ fetch: app.fetch, port });
console.log(`api on :${port}${isEmbedded ? " (embedded db)" : ""}`);
