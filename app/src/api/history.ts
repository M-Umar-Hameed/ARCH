import { apiFetch } from "./client.js";
import type { Event } from "./types.js";
export const history = { get: (ticketId: string) => apiFetch(`/tickets/${ticketId}/history`, {}) as Promise<Event[]> };
