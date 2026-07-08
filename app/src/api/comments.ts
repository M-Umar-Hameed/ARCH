import { apiFetch } from "./client.js";
import type { Comment } from "./types.js";
export const comments = {
  list: (ticketId: string) => apiFetch(`/tickets/${ticketId}/comments`, {}) as Promise<Comment[]>,
  add: (ticketId: string, body: string) =>
    apiFetch(`/tickets/${ticketId}/comments`, { method: "POST", body: { body } }) as Promise<Comment>,
};
