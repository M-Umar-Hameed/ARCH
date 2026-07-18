import { expect, test, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

const apiFetch = vi.fn();
vi.mock("../../api/client.js", () => ({ apiFetch: (...a: any[]) => apiFetch(...a) }));

// vi.mock factories hoist above const initializers; vi.hoisted keeps the
// handle initialized first.
const { mockStoreGet } = vi.hoisted(() => ({ mockStoreGet: vi.fn() }));
vi.mock("@tauri-apps/plugin-store", () => ({
  load: vi.fn().mockResolvedValue({
    get: mockStoreGet,
    set: vi.fn(),
    delete: vi.fn(),
    save: vi.fn(),
  })
}));

import { IntegrationsTab } from "./IntegrationsTab.js";
import { ProjectProvider } from "../../context/project.js";

beforeEach(() => {
  apiFetch.mockReset();
  mockStoreGet.mockReset();
});

function TestWrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>
      <ProjectProvider>{children}</ProjectProvider>
    </QueryClientProvider>
  );
}

test("active project renders bindings view", async () => {
  mockStoreGet.mockResolvedValue("p1");
  apiFetch.mockImplementation(async (path) => {
    if (path === "/projects") return [{ id: "p1", name: "Project One" }];
    return {};
  });

  render(<TestWrapper><IntegrationsTab /></TestWrapper>);
  
  await waitFor(() => expect(screen.getByText("Connections for Project One")).toBeInTheDocument());
});

test("null active project renders global view", async () => {
  mockStoreGet.mockResolvedValue(null);
  apiFetch.mockImplementation(async (path) => {
    if (path === "/projects") return [{ id: "p1", name: "Project One" }];
    return {};
  });

  render(<TestWrapper><IntegrationsTab /></TestWrapper>);
  
  await waitFor(() => expect(screen.getByText("Global connections")).toBeInTheDocument());
});
