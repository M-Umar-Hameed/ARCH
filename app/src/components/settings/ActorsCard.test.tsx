import { expect, test, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const list = vi.fn();
const create = vi.fn();
vi.mock("../../api/actors.js", () => ({
  actors: { list: (...a: any[]) => list(...a), create: (...a: any[]) => create(...a) },
}));

import { ActorsCard } from "./ActorsCard.js";

beforeEach(() => {
  list.mockReset().mockResolvedValue([{ id: "a1", name: "Alice", kind: "human", role: "admin" }]);
  create.mockReset();
});

test("renders the actor list from GET /actors", async () => {
  render(<ActorsCard />);
  await waitFor(() => expect(screen.getByText("Alice")).toBeInTheDocument());
  expect(screen.getByText("human")).toBeInTheDocument();
  expect(screen.getByText("admin")).toBeInTheDocument();
});

test("submitting the new agent key form shows the returned key with a one-time warning", async () => {
  create.mockResolvedValue({ actor: { id: "a2", name: "Bot", kind: "agent", role: "member" }, apiKey: "sk-test-123" });
  render(<ActorsCard />);
  await waitFor(() => expect(list).toHaveBeenCalled());

  fireEvent.change(screen.getByPlaceholderText("Agent name"), { target: { value: "Bot" } });
  fireEvent.click(screen.getByText("Create"));

  await waitFor(() => expect(screen.getByDisplayValue("sk-test-123")).toBeInTheDocument());
  expect(create).toHaveBeenCalledWith({ name: "Bot", kind: "agent", role: "member" });
  expect(screen.getByText(/cannot be retrieved later/i)).toBeInTheDocument();
});

test("shows an inline error when creation is forbidden", async () => {
  create.mockRejectedValue(new Error("forbidden: admin role required"));
  render(<ActorsCard />);
  await waitFor(() => expect(list).toHaveBeenCalled());

  fireEvent.change(screen.getByPlaceholderText("Agent name"), { target: { value: "Bot" } });
  fireEvent.click(screen.getByText("Create"));

  await waitFor(() => expect(screen.getByText("forbidden: admin role required")).toBeInTheDocument());
});
