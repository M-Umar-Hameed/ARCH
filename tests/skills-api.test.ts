import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { createActor } from "../src/services/actors.js";
import { app } from "../src/api/app.js";

function uniq(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function adminHeaders(): Promise<Record<string, string>> {
  const { apiKey } = await createActor({ name: uniq("skills-api-admin"), kind: "human", role: "admin" });
  return { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
}

function g(cwd: string, ...a: string[]): void {
  execFileSync("git", a, { cwd });
}

function initSourceRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "skills-api-src-"));
  g(dir, "init", "-b", "main");
  g(dir, "config", "user.email", "t@t");
  g(dir, "config", "user.name", "t");
  mkdirSync(join(dir, "greeter"), { recursive: true });
  writeFileSync(join(dir, "greeter", "SKILL.md"), "---\nname: greeter\ndescription: Says hi\n---\n");
  g(dir, "add", "-A");
  g(dir, "commit", "-m", "base");
  return dir;
}

let sourceRepo: string;
let skillsHome: string;
let url: string;

beforeEach(() => {
  sourceRepo = initSourceRepo();
  skillsHome = mkdtempSync(join(tmpdir(), "skills-api-home-"));
  process.env.VIBEOPS_SKILLS_HOME = skillsHome;
  process.env.VIBEOPS_SKILLS_ALLOW_LOCAL = "1";
  url = sourceRepo;
});

afterEach(() => {
  delete process.env.VIBEOPS_SKILLS_HOME;
  delete process.env.VIBEOPS_SKILLS_ALLOW_LOCAL;
  rmSync(sourceRepo, { recursive: true, force: true });
  rmSync(skillsHome, { recursive: true, force: true });
});

describe("skills API", () => {
  it("POST /skills/marketplaces clones + scans; repeat post refreshes instead of erroring", async () => {
    const h = await adminHeaders();
    const res = await app.request("/skills/marketplaces", {
      method: "POST", headers: h, body: JSON.stringify({ url }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ url, skills: [{ name: "greeter", description: "Says hi", dir: "greeter", installed: false }] });

    const again = await app.request("/skills/marketplaces", {
      method: "POST", headers: h, body: JSON.stringify({ url }),
    });
    expect(again.status).toBe(200);

    const listed = await app.request("/skills/marketplaces", { headers: h });
    const listedBody = await listed.json();
    expect(listedBody.filter((m: { url: string }) => m.url === url)).toHaveLength(1);
  });

  it("POST /skills/marketplaces 400s on a non-https url", async () => {
    delete process.env.VIBEOPS_SKILLS_ALLOW_LOCAL;
    const h = await adminHeaders();
    const res = await app.request("/skills/marketplaces", {
      method: "POST", headers: h, body: JSON.stringify({ url: "http://example.com/repo.git" }),
    });
    expect(res.status).toBe(400);
  });

  it("POST /skills/marketplaces 400s on clone failure", async () => {
    const h = await adminHeaders();
    const res = await app.request("/skills/marketplaces", {
      method: "POST", headers: h, body: JSON.stringify({ url: join(sourceRepo, "does-not-exist") }),
    });
    expect(res.status).toBe(400);
  });

  it("install / installed / uninstall round trip; uninstall 404s afterward", async () => {
    const h = await adminHeaders();
    await app.request("/skills/marketplaces", { method: "POST", headers: h, body: JSON.stringify({ url }) });

    const installRes = await app.request("/skills/install", {
      method: "POST", headers: h, body: JSON.stringify({ url, dir: "greeter" }),
    });
    expect(installRes.status).toBe(201);
    const installed = await installRes.json();
    expect(installed).toMatchObject({ name: "greeter", dir: "greeter", url });
    expect(existsSync(join(skillsHome, ".claude", "skills", "greeter", "SKILL.md"))).toBe(true);

    const listRes = await app.request("/skills/installed", { headers: h });
    const listBody = await listRes.json();
    expect(listBody.find((e: { dir: string }) => e.dir === "greeter")).toMatchObject({ present: true });

    const uninstallRes = await app.request("/skills/uninstall", {
      method: "POST", headers: h, body: JSON.stringify({ name: "greeter" }),
    });
    expect(uninstallRes.status).toBe(200);
    expect(existsSync(join(skillsHome, ".claude", "skills", "greeter"))).toBe(false);

    const again = await app.request("/skills/uninstall", {
      method: "POST", headers: h, body: JSON.stringify({ name: "greeter" }),
    });
    expect(again.status).toBe(404);
  });

  it("POST /skills/install 409s when the target exists and isn't ours", async () => {
    const h = await adminHeaders();
    await app.request("/skills/marketplaces", { method: "POST", headers: h, body: JSON.stringify({ url }) });
    mkdirSync(join(skillsHome, ".claude", "skills", "greeter"), { recursive: true });
    writeFileSync(join(skillsHome, ".claude", "skills", "greeter", "hand-authored.txt"), "mine\n");

    const res = await app.request("/skills/install", {
      method: "POST", headers: h, body: JSON.stringify({ url, dir: "greeter" }),
    });
    expect(res.status).toBe(409);
  });

  it("DELETE /skills/marketplaces removes the registry entry but leaves an installed skill in place", async () => {
    const h = await adminHeaders();
    await app.request("/skills/marketplaces", { method: "POST", headers: h, body: JSON.stringify({ url }) });
    await app.request("/skills/install", { method: "POST", headers: h, body: JSON.stringify({ url, dir: "greeter" }) });

    const delRes = await app.request("/skills/marketplaces", {
      method: "DELETE", headers: h, body: JSON.stringify({ url }),
    });
    expect(delRes.status).toBe(200);

    const listed = await app.request("/skills/marketplaces", { headers: h });
    expect((await listed.json()).find((m: { url: string }) => m.url === url)).toBeUndefined();
    expect(existsSync(join(skillsHome, ".claude", "skills", "greeter"))).toBe(true);

    await app.request("/skills/uninstall", { method: "POST", headers: h, body: JSON.stringify({ name: "greeter" }) });
  });
});
