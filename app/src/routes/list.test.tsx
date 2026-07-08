import { expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";

vi.mock("../api/tickets.js", () => ({ tickets: {
  list: vi.fn(async () => [{ id: "t1", title: "First", status: "open", priority: "normal", assigneeId: null }]),
  search: vi.fn(async () => []),
} }));
vi.mock("../api/projects.js", () => ({ projects: { list: vi.fn(async () => []) } }));
vi.mock("../api/actors.js", () => ({ actors: { list: vi.fn(async () => []) } }));
vi.mock("@tanstack/react-router", () => ({ Link: (p: any) => <a>{p.children}</a> }));

import { ListScreen } from "./list.js";

test("renders tickets from the api", async () => {
  render(<QueryClientProvider client={new QueryClient()}><ListScreen /></QueryClientProvider>);
  await waitFor(() => expect(screen.getByText("First")).toBeInTheDocument());
});
