import { apiFetch } from "./client.js";
import type { Note } from "./types.js";
export const notes = {
  save: (input: { body: string; scope: string; refId?: string }) =>
    apiFetch("/notes", { method: "POST", body: input }) as Promise<Note>,
};
