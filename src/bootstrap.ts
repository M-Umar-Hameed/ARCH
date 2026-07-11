import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { db } from "./db/client.js";
import { actors } from "./db/schema.js";
import { createActor } from "./services/actors.js";
import { createProject } from "./services/projects.js";

// First-run self-setup for the embedded database. Idempotent: any existing
// actor means the system is already initialized.
export async function runBootstrap(
  port: number, dir = join(homedir(), ".vibeops"),
): Promise<{ bootstrapped: boolean }> {
  const [existing] = await db.select({ id: actors.id }).from(actors).limit(1);
  if (existing) return { bootstrapped: false };

  await createProject({ key: "inbox", name: "Inbox" });
  const { apiKey } = await createActor({ name: "owner", kind: "human", role: "admin" });
  const creds = { baseUrl: `http://localhost:${port}`, apiKey };
  try {
    // Owner-only permissions (like ~/.ssh). Effective on POSIX; on Windows the
    // file inherits the user-profile ACL, which is already user-scoped.
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    writeFileSync(join(dir, "credentials.json"), JSON.stringify(creds, null, 2), { mode: 0o600 });
  } catch (e) {
    console.warn(`could not write credentials file: ${(e as Error).message}`);
    console.log(`api key (copy now, shown once): ${apiKey}`);
  }
  return { bootstrapped: true };
}
