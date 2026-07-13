import { expect, test, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";

const apiFetch = vi.fn();
vi.mock("../../api/client.js", () => ({ apiFetch: (...a: any[]) => apiFetch(...a) }));

import { MCPTab } from "./MCPTab.js";
const wrap = (ui: any) => <QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>;

beforeEach(() => {
  apiFetch.mockReset().mockResolvedValue({
    url: "http://localhost:8787/mcp",
    claudeCode: { command: "claude mcp add tickets http://localhost:8787/mcp" },
    cursor: { path: "~/.cursor/mcp.json", snippet: {} },
    gemini: { path: "~/.gemini/mcp.json", snippet: {} },
  });
});

test("renders the connect card with no mock server grid", async () => {
  render(wrap(<MCPTab />));
  expect(screen.getByText("Connect an Agent")).toBeInTheDocument();
  await waitFor(() => expect(screen.getByText("http://localhost:8787/mcp")).toBeInTheDocument());
  expect(screen.queryByText("Figma Design System")).not.toBeInTheDocument();
  expect(screen.queryByText("Add Custom Server")).not.toBeInTheDocument();
  expect(screen.queryByText("Manual Connection")).not.toBeInTheDocument();
});
