// CLI entrypoint for `npm run mcp` (stdio transport). Kept separate from
// server.ts (the pure buildServer export) because that file is now also
// imported by src/api/mcp-routes.ts for the HTTP transport; esbuild bundles
// both into one file for the api sidecar, and an "am I the main module" guard
// based on import.meta.url can't tell entrypoints apart once merged into a
// single bundled output.
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { buildServer } from "./server.js";

const server = await buildServer(process.env.TICKETS_API_KEY!);
await server.connect(new StdioServerTransport());
