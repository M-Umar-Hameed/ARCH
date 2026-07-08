import { apiFetch } from "./client.js";
import type { Ticket } from "./types.js";
export const tickets = {
  list: (f: { projectId?: string; status?: string } = {}) =>
    apiFetch("/tickets", { query: f }) as Promise<Ticket[]>,
  search: (q: string) => apiFetch("/search", { query: { q } }) as Promise<Ticket[]>,
  get: (id: string) => apiFetch(`/tickets/${id}`, {}) as Promise<Ticket>,
  create: (input: { projectId: string; title: string; body?: string; priority?: string; assigneeId?: string }) =>
    apiFetch("/tickets", { method: "POST", body: input }) as Promise<Ticket>,
  update: (id: string, expectedVersion: number, patch: Record<string, unknown>) =>
    apiFetch(`/tickets/${id}`, { method: "PATCH", body: { expectedVersion, ...patch } }) as Promise<Ticket>,
};
