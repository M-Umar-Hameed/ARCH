import { apiFetch } from "./client.js";

export type SystemStatus = {
  db: string;
  embedder: string;
  watcher: { status: string; indexed: number };
  activeRuns: number;
  uptimeMs: number;
};

export type SystemMetrics = {
  uptime: number; // in hours
  ping: number; // in ms
  clusterHealth: number; // percentage
  cpuLoad: number; // percentage
  memoryUsed: number; // percentage
  ioWait: number; // in ms
};

export type SystemLog = {
  at: string;
  level: string;
  message: string;
};

export type SystemTopology = {
  nodes: number;
  regions: string[];
};

export const system = {
  getMetrics: () => apiFetch("/system/metrics", {}) as Promise<SystemMetrics>,
  getLogs: () => apiFetch("/system/logs", {}) as Promise<SystemLog[]>,
  getTopology: () => apiFetch("/system/topology", {}) as Promise<SystemTopology>,
  getStatus: () => apiFetch("/system/status", {}) as Promise<SystemStatus>,
};
