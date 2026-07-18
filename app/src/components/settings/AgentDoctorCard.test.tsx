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
    ]);
    if (path === "/forge/doctor?fresh=true") return Promise.resolve([
      { name: "fable", binary: "claude", probe: { ok: false, error: "renamed" }, auth: { known: true, connected: true }, lastChecked: "2026-07-18T00:05:00.000Z" },
    ]);
    return Promise.resolve([]);
  });

  render(wrap(<AgentDoctorCard />));
  await waitFor(() => expect(screen.getByText("fable")).toBeInTheDocument());
  expect(screen.getByText(/claude/)).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /run checks/i }));
  await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/forge/doctor?fresh=true"));
  await waitFor(() => expect(screen.getByText("renamed")).toBeInTheDocument());
});
