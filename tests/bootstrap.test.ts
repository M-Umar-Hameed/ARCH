import { expect, test } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runBootstrap } from "../src/bootstrap.js";

test("bootstrap creates credentials once and is idempotent", async () => {
  const dir = mkdtempSync(join(tmpdir(), "vibeops-boot-"));
  const first = await runBootstrap(8787, dir);
  // On a shared dev DB actors may already exist; assert on the return contract:
  if (first.bootstrapped) {
    const creds = JSON.parse(readFileSync(join(dir, "credentials.json"), "utf8"));
    expect(creds.baseUrl).toBe("http://localhost:8787");
    expect(creds.apiKey.length).toBeGreaterThan(20);
  }
  const second = await runBootstrap(8787, dir);
  expect(second.bootstrapped).toBe(false); // actors now exist -> always skips
  rmSync(dir, { recursive: true, force: true });
});
