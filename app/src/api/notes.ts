import { apiFetch } from "./client.js";
import type { Note } from "./types.js";
export const notes = {
  list: (filter: { scope?: string; refId?: string; limit?: number } = {}) =>
    apiFetch("/notes", { query: { scope: filter.scope, refId: filter.refId, limit: filter.limit?.toString() } }) as Promise<Note[]>,
  get: (id: string) => apiFetch(`/notes/${id}`) as Promise<Note>,
  save: (input: { body: string; scope: string; refId?: string; title?: string }) =>
    apiFetch("/notes", { method: "POST", body: input }) as Promise<Note>,
  update: (id: string, expectedVersion: number, patch: { title?: string; body?: string }) =>
    apiFetch(`/notes/${id}`, { method: "PATCH", body: { expectedVersion, ...patch } }) as Promise<Note>,
  remove: (id: string, expectedVersion: number) =>
    apiFetch(`/notes/${id}`, { method: "DELETE", body: { expectedVersion } }) as Promise<{ ok: boolean }>,
};
