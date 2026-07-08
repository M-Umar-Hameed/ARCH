import { apiFetch } from "./client.js";
import type { Actor } from "./types.js";
export const actors = { list: () => apiFetch("/actors", {}) as Promise<Actor[]> };
