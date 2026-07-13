import { expect, test, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";

const apiFetch = vi.fn();
vi.mock("../../api/client.js", () => ({ apiFetch: (...a: any[]) => apiFetch(...a) }));

import { AIUsageTab } from "./AIUsageTab.js";
const wrap = (ui: any) => (
  <QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>
);

beforeEach(() => {
  apiFetch.mockReset().mockImplementation((path: string) => {
    if (path === "/system/agents") {
      return Promise.resolve({
        sinceDays: 7,
        agents: [
          {
            agent: "claude",
            connected: true,
            account: "dev@example.com",
            plan: "pro",
            authMode: "oauth",
            tokens: { inputTokens: 1_000_000, outputTokens: 300_000, totalTokens: 1_300_000, sessions: 12 },
          },
          {
            agent: "antigravity",
            connected: true,
            account: null,
            authMode: "oauth",
            note: "account not exposed locally",
            tokens: null,
          },
          {
            agent: "codex",
            connected: false,
            account: null,
            authMode: "unknown",
            tokens: null,
          },
        ],
      });
    }
    if (path === "/system/ai-usage") {
      return Promise.resolve({ overview: { totalTokens: 0, totalCost: 0 }, usage: [], agents: [] });
    }
    return Promise.resolve({});
  });
});

test("renders real accounts and observed tokens from /system/agents", async () => {
  render(wrap(<AIUsageTab />));

  await waitFor(() => expect(screen.getByText("dev@example.com")).toBeInTheDocument());
  expect(screen.getByText("1.3M")).toBeInTheDocument();
  expect(screen.getByText("account not exposed locally")).toBeInTheDocument();
  expect(screen.getByText("Not connected")).toBeInTheDocument();
  expect(
    screen.getByText(/Usage observed by VibeOps from local session logs/),
  ).toBeInTheDocument();
});

test("antigravity shows an em dash when it exposes no token counts", async () => {
  render(wrap(<AIUsageTab />));
  await waitFor(() => expect(screen.getByText("dev@example.com")).toBeInTheDocument());
  expect(screen.getAllByText("—").length).toBeGreaterThan(0);
});

test("shows an honest empty state instead of mock usage numbers", async () => {
  render(wrap(<AIUsageTab />));
  await waitFor(() => expect(screen.getByText("No usage logged yet")).toBeInTheDocument());
  expect(screen.queryByText(/Claude 3.5 Sonnet/)).not.toBeInTheDocument();
  expect(screen.queryByText(/Provider Token Quotas/)).not.toBeInTheDocument();
});
