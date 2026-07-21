import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createActor } from "../src/services/actors.js";
import { app } from "../src/api/app.js";

process.env.EMBED_PROVIDER = "fake";

function uniq(p: string) { return `${p}-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
async function memberHeaders() {
  const { apiKey } = await createActor({ name: uniq("attach-actor"), kind: "human" });
  return { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
}
// 1x1 transparent PNG
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC",
  "base64",
);

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "attach-")); process.env.VIBEOPS_ATTACHMENTS_DIR = dir; });
afterEach(() => { delete process.env.VIBEOPS_ATTACHMENTS_DIR; rmSync(dir, { recursive: true, force: true }); });

describe("POST /forge/attachments", () => {
  it("stores a valid png and returns absolute-path markdown; file exists on disk", async () => {
    const h = await memberHeaders();
    const res = await app.request("/forge/attachments", {
      method: "POST", headers: h,
      body: JSON.stringify({ dataBase64: PNG.toString("base64"), name: "shot.png" }),
    });
    expect(res.status).toBe(201);
    const j = await res.json();
    expect(existsSync(j.path)).toBe(true);
    expect(j.path.startsWith(dir)).toBe(true);
    expect(j.markdown).toBe(`![shot.png](${j.path.replace(/\\/g, "/")})`);
  });

  it("rejects non-image bytes (400)", async () => {
    const h = await memberHeaders();
    const res = await app.request("/forge/attachments", {
      method: "POST", headers: h,
      body: JSON.stringify({ dataBase64: Buffer.from("hello world not an image").toString("base64") }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects oversized upload (400)", async () => {
    const h = await memberHeaders();
    const big = Buffer.concat([PNG, Buffer.alloc(10 * 1024 * 1024 + 1)]).toString("base64");
    const res = await app.request("/forge/attachments", {
      method: "POST", headers: h, body: JSON.stringify({ dataBase64: big }),
    });
    expect(res.status).toBe(400);
  });

  it("requires auth (401)", async () => {
    const res = await app.request("/forge/attachments", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dataBase64: PNG.toString("base64") }),
    });
    expect(res.status).toBe(401);
  });
});
