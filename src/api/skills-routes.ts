import type { Hono } from "hono";
import type { Actor } from "../db/schema.js";
import { requireAdmin } from "./auth.js";
import { ConflictError, NotFoundError } from "../services/errors.js";
import {
  addMarketplace, listMarketplaces, removeMarketplace,
  installSkill, uninstallSkill, listInstalled,
} from "../skills/marketplace.js";

type AppEnv = { Variables: { actor: Actor } };

export function registerSkillsRoutes(app: Hono<AppEnv>): void {
  app.get("/skills/marketplaces", requireAdmin, async (c) => c.json(await listMarketplaces()));

  app.post("/skills/marketplaces", requireAdmin, async (c) => {
    const { url } = await c.req.json().catch(() => ({}));
    if (typeof url !== "string" || !url) return c.json({ error: "url required" }, 400);
    try {
      const skills = await addMarketplace(url);
      return c.json({ url, skills });
    } catch (e) {
      return c.json({ error: (e as Error).message }, 400);
    }
  });

  app.delete("/skills/marketplaces", requireAdmin, async (c) => {
    const { url } = await c.req.json().catch(() => ({}));
    if (typeof url !== "string" || !url) return c.json({ error: "url required" }, 400);
    await removeMarketplace(url);
    return c.json({ ok: true });
  });

  app.post("/skills/install", requireAdmin, async (c) => {
    const { url, dir } = await c.req.json().catch(() => ({}));
    if (typeof url !== "string" || !url) return c.json({ error: "url required" }, 400);
    if (typeof dir !== "string" || !dir) return c.json({ error: "dir required" }, 400);
    try {
      const entry = await installSkill(url, dir);
      return c.json(entry, 201);
    } catch (e) {
      if (e instanceof ConflictError || e instanceof NotFoundError) throw e;
      return c.json({ error: (e as Error).message }, 400);
    }
  });

  app.post("/skills/uninstall", requireAdmin, async (c) => {
    const { name } = await c.req.json().catch(() => ({}));
    if (typeof name !== "string" || !name) return c.json({ error: "name required" }, 400);
    await uninstallSkill(name);
    return c.json({ ok: true });
  });

  app.get("/skills/installed", requireAdmin, async (c) => c.json(await listInstalled()));
}
