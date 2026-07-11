import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { convert } from "@opendataloader/pdf";

// Convert a PDF to markdown text. Writes to a temp dir OUTSIDE the vault
// (the default output is next to the input, which the watcher would re-ingest),
// reads the produced markdown, and cleans up.
export async function convertPdf(path: string): Promise<string> {
  const out = mkdtempSync(join(tmpdir(), "odl-"));
  try {
    await convert(path, { outputDir: out, format: "markdown", quiet: true });
    const md = readdirSync(out).find((f) => f.endsWith(".md"));
    if (!md) throw new Error(`no markdown produced for ${path}`);
    return readFileSync(join(out, md), "utf8");
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}
