import { expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";

const apiFetch = vi.fn();
vi.mock("../api/client.js", () => ({ apiFetch: (...a: any[]) => apiFetch(...a) }));
vi.mock("../lib/api.js", () => ({ api: { get: vi.fn(async () => ({})), post: vi.fn(async () => ({})), patch: vi.fn(async () => ({})) } }));
vi.mock("../api/tickets.js", () => ({ tickets: { search: vi.fn(async () => []), create: vi.fn() } }));
vi.mock("../api/projects.js", () => ({ projects: { list: vi.fn(async () => []), create: vi.fn() } }));

vi.mock("@tanstack/react-router", () => ({
  Link: (p: any) => <a>{p.children}</a>,
  useLocation: () => ({ pathname: "/" }),
  useNavigate: () => vi.fn(),
  Outlet: () => <div data-testid="outlet" />,
}));

import { Root } from "./root.js";
import { ProjectProvider } from "../context/project.js";

const wrap = (ui: any) => (
  <QueryClientProvider client={new QueryClient()}>
    <ProjectProvider>{ui}</ProjectProvider>
  </QueryClientProvider>
);

test("sidebar is always visible; no hamburger in header", () => {
  render(wrap(<Root />));
  const aside = document.querySelector("aside")!;
  expect(aside.className).toContain("translate-x-0");
  expect(screen.queryByText("menu")).toBeNull();
});

import { api } from "../lib/api.js";
import { waitFor } from "@testing-library/react";

test("wizard renders when firstRun is true", async () => {
  (api.get as any).mockImplementation((path: string) => {
    if (path === "/system/first-run") return Promise.resolve({ firstRun: true });
    return Promise.resolve({});
  });
  render(wrap(<Root />));
  await waitFor(() => expect(screen.getByText("Welcome to VibeOps")).toBeInTheDocument());
});

test("wizard hidden when firstRun is false", async () => {
  (api.get as any).mockImplementation((path: string) => {
    if (path === "/system/first-run") return Promise.resolve({ firstRun: false });
    return Promise.resolve({});
  });
  render(wrap(<Root />));
  await new Promise(r => setTimeout(r, 100)); // wait for effect
  expect(screen.queryByText("Welcome to VibeOps")).not.toBeInTheDocument();
});
