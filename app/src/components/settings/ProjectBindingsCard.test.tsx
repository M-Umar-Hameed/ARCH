import { expect, test, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

const apiFetch = vi.fn();
vi.mock("../../api/client.js", () => ({ apiFetch: (...a: any[]) => apiFetch(...a) }));

import { ProjectBindingsCard } from "./ProjectBindingsCard.js";

beforeEach(() => {
  apiFetch.mockReset();
});

function TestWrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

test("renders inputs from mocked GET settings, Save PUTs the right key/value, clear PUTs empty", async () => {
  apiFetch.mockImplementation(async (path, opts) => {
    if (path === "/projects/p1/settings") return { "github.repo": "owner/testrepo" };
    if (path === "/settings/github.token") return { value: "some-token" };
    return {};
  });

  render(
    <TestWrapper>
      <ProjectBindingsCard
        projectId="p1"
        id="github"
        title="GitHub"
        subtitle="Issues"
        borderColorClass="primary/30"
        icon={<div />}
        bindingKey="github.repo"
        label="Repo"
        globalCredentialKey="github.token"
      />
    </TestWrapper>
  );

  // It should show the bound value
  await waitFor(() => expect(screen.getByText("owner/testrepo")).toBeInTheDocument());
  
  // Click Edit Binding
  fireEvent.click(screen.getByRole("button", { name: "Edit Binding" }));

  // Value should be populated in input
  const input = await screen.findByRole("textbox");
  expect(input).toHaveValue("owner/testrepo");

  // Type new value
  fireEvent.change(input, { target: { value: "owner/newrepo" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));

  await waitFor(() => {
    expect(apiFetch).toHaveBeenCalledWith("/projects/p1/settings/github.repo", {
      method: "PUT",
      body: { value: "owner/newrepo" }
    });
  });

  // Test clear - must re-enter edit mode first
  fireEvent.click(screen.getByRole("button", { name: "Edit Binding" }));
  fireEvent.click(screen.getByRole("button", { name: "Clear" }));
  
  await waitFor(() => {
    expect(apiFetch).toHaveBeenCalledWith("/projects/p1/settings/github.repo", {
      method: "PUT",
      body: { value: "" }
    });
  });
});
