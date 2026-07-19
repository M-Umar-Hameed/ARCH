import { expect, test, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";

const apiFetch = vi.fn();
vi.mock("../../api/client.js", () => ({ apiFetch: (...a: any[]) => apiFetch(...a) }));

import { AgentDoctorCard } from "./AgentDoctorCard.js";
const wrap = (ui: any) => <QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>;

beforeEach(() => {
  apiFetch.mockReset();
});

test("lists agent health and lets the user re-run checks", async () => {
  apiFetch.mockImplementation((path: string) => {
    if (path === "/forge/doctor") return Promise.resolve([
      { name: "fable", binary: "claude", probe: { ok: true }, auth: { known: true, connected: true }, lastChecked: "2026-07-18T00:00:00.000Z" },
      { name: "mykimi", binary: "kimi", probe: { ok: true }, auth: { known: false, connected: null }, lastChecked: "2026-07-18T00:00:00.000Z" },
    ]);
    if (path === "/forge/doctor?fresh=true") return Promise.resolve([
      { name: "fable", binary: "claude", probe: { ok: false, error: "renamed" }, auth: { known: true, connected: true }, lastChecked: "2026-07-18T00:05:00.000Z" },
      { name: "mykimi", binary: "kimi", probe: { ok: true }, auth: { known: false, connected: null }, lastChecked: "2026-07-18T00:05:00.000Z" },
    ]);
    return Promise.resolve([]);
  });

  const { container } = render(wrap(<AgentDoctorCard />));
  
  expect(screen.getByText(/never stores/i)).toBeInTheDocument();
  
  await waitFor(() => expect(screen.getByText("fable")).toBeInTheDocument());
  expect(screen.getAllByText(/claude/).length).toBeGreaterThan(0);
  expect(screen.getByText("mykimi")).toBeInTheDocument();
  
  // Expand claude
  const detailsSummaries = screen.getAllByText("How to connect");
  fireEvent.click(detailsSummaries[0]);
  
  expect(screen.getByText("claude login")).toBeInTheDocument();
  expect(screen.getByText("claude login").tagName).toBe("CODE");
  
  // Expand kimi
  fireEvent.click(detailsSummaries[1]);
  expect(screen.getByText(/Authenticate this CLI in your terminal the way its provider expects/i)).toBeInTheDocument();

  expect(container.textContent).not.toMatch(/sk-|ey[A-Za-z0-9_-]{10,}/);

  fireEvent.click(screen.getByRole("button", { name: /run checks/i }));
  await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/forge/doctor?fresh=true"));
  await waitFor(() => expect(screen.getByText("renamed")).toBeInTheDocument());
});
