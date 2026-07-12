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
// Embedded (installed desktop) mode is loopback-only; external-Postgres deployments
// legitimately serve other hosts.
serve({ fetch: app.fetch, port, hostname: isEmbedded ? "127.0.0.1" : "0.0.0.0" });
console.log(`api on :${port}${isEmbedded ? " (embedded db)" : ""}`);
