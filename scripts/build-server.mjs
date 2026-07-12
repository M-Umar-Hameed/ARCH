import { build } from "esbuild";
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const outDir = process.argv.includes("--out")
  ? process.argv[process.argv.indexOf("--out") + 1]
  : "dist-server";

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

// ponytail: cjs format errors on the server graph's top-level await (not just
// import.meta, which esbuild shims fine) -- esm output + createRequire banner
// for the external pglite require is the documented fallback (see brief).
await build({
  entryPoints: ["src/api/server.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  outfile: join(outDir, "server.mjs"),
  external: ["@electric-sql/pglite", "@huggingface/transformers"],
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  logLevel: "info",
});

cpSync("node_modules/@electric-sql/pglite", join(outDir, "node_modules", "@electric-sql", "pglite"), { recursive: true });
cpSync("drizzle", join(outDir, "drizzle"), { recursive: true });
console.log(`payload ready: ${outDir}`);
