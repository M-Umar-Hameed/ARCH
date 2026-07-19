import { createMiddleware } from "hono/factory";
import { resolveActor } from "../services/actors.js";
import { AuthError, ForbiddenError } from "../services/errors.js";
import type { Actor } from "../db/schema.js";

const failures = new Map<string, { count: number; until: number }>();

export const auth = createMiddleware<{ Variables: { actor: Actor } }>(async (c, next) => {
  const header = c.req.header("Authorization") ?? "";
  const key = header.replace(/^Bearer\s+/i, "");
  const prefix = key.slice(0, 8);
  const now = Date.now();

  // ponytail-comment: ceiling is 20 failures/minute per prefix
  const fail = failures.get(prefix);
  if (fail && fail.until > now && fail.count >= 20) {
    return c.text("Too Many Requests", 429);
  }

  let actor: Actor;
  try {
    actor = await resolveActor(key);
  } catch {
    const current = (fail && fail.until > now) ? fail.count : 0;
    failures.set(prefix, { count: current + 1, until: now + 60000 });
    throw new AuthError("unauthorized");
  }
  
  if (actor.revoked) {
    const current = (fail && fail.until > now) ? fail.count : 0;
    failures.set(prefix, { count: current + 1, until: now + 60000 });
    throw new AuthError("unauthorized");
  }

  failures.delete(prefix);
  c.set("actor", actor);
  await next();
});

// Admin-only gate for routes that touch host state (settings, filesystem
// indexing, config writes, key minting). Runs after `auth`, so a bad key is
// 401 before role is ever considered.
export const requireAdmin = createMiddleware<{ Variables: { actor: Actor } }>(async (c, next) => {
  if (c.get("actor").role !== "admin") throw new ForbiddenError("forbidden");
  await next();
});
