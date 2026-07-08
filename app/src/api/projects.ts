import { apiFetch } from "./client.js";
import type { Project } from "./types.js";
export const projects = {
  list: () => apiFetch("/projects", {}) as Promise<Project[]>,
  create: (input: { key: string; name: string }) =>
    apiFetch("/projects", { method: "POST", body: input }) as Promise<Project>,
};
