import { apiFetch } from "./client.js";
import type { Hit } from "./types.js";
export const knowledge = {
  search: (q: string, limit?: number) =>
    apiFetch("/knowledge", { query: { q, limit: limit?.toString() } }) as Promise<Hit[]>,
};
