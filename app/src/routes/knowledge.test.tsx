import { expect, test, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { StaleVersionError } from "../api/errors.js";

const notesList = vi.fn();
const notesSave = vi.fn();
const notesUpdate = vi.fn();
const notesRemove = vi.fn();
vi.mock("../api/knowledge.js", () => ({ knowledge: { search: vi.fn(async () => [{ content: "backup nightly", sourceKind: "vault", sourceRef: "sop.md", score: 1, citation: "sop.md" }]) } }));
vi.mock("../api/notes.js", () => ({ notes: {
  list: (...a: any[]) => notesList(...a),
  save: (...a: any[]) => notesSave(...a),
  update: (...a: any[]) => notesUpdate(...a),
  remove: (...a: any[]) => notesRemove(...a),
} }));
const apiFetch = vi.fn();
vi.mock("../api/client.js", () => ({ apiFetch: (...a: any[]) => apiFetch(...a) }));

import { KnowledgeScreen } from "./knowledge.js";
const wrap = (ui: any) => <QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>;

const note = { id: "n1", actorId: "a1", body: "First line\nmore body", title: null, scope: "global", refId: null, indexed: true, version: 1, deletedAt: null, createdAt: "2026-01-01" };

beforeEach(() => {
  notesList.mockReset().mockResolvedValue([]);
  notesSave.mockReset().mockResolvedValue({ id: "n1" });
  notesUpdate.mockReset().mockResolvedValue({ ...note, version: 2 });
  notesRemove.mockReset().mockResolvedValue({ ok: true });
  apiFetch.mockReset().mockResolvedValue({ codex: { indexed: 1, skipped: 0, failed: 0 }, "claude-code": { indexed: 38, skipped: 2, failed: 0 } });
});

test("search shows results with citation", async () => {
  render(wrap(<KnowledgeScreen />));
  fireEvent.change(screen.getByPlaceholderText(/Search Obsidian Vault/i), { target: { value: "backup" } });
  fireEvent.click(screen.getByText("Scan"));
  await waitFor(() => expect(screen.getByText(/backup nightly/)).toBeInTheDocument());
  expect(screen.getByText(/sop.md/)).toBeInTheDocument();
});

test("notes list renders titles and snippets", async () => {
  notesList.mockResolvedValue([note, { ...note, id: "n2", title: "Titled note", body: "irrelevant" }]);
  render(wrap(<KnowledgeScreen />));
  await waitFor(() => expect(screen.getByText("First line")).toBeInTheDocument());
  expect(screen.getByText("Titled note")).toBeInTheDocument();
});

test("editing a note saves with the loaded version as expectedVersion", async () => {
  notesList.mockResolvedValue([note]);
  render(wrap(<KnowledgeScreen />));
  await waitFor(() => screen.getByText("First line"));
  fireEvent.click(screen.getByText("First line"));
  const textarea = await screen.findByDisplayValue(/First line/);
  fireEvent.change(textarea, { target: { value: "edited body" } });
  fireEvent.click(screen.getByText("Save"));
  await waitFor(() => expect(notesUpdate).toHaveBeenCalledWith("n1", 1, { title: undefined, body: "edited body" }));
});

test("a stale version conflict keeps the draft and refetches the note", async () => {
  notesList.mockResolvedValue([note]);
  notesUpdate.mockRejectedValueOnce(new StaleVersionError("stale"));
  render(wrap(<KnowledgeScreen />));
  await waitFor(() => screen.getByText("First line"));
  fireEvent.click(screen.getByText("First line"));
  const textarea = await screen.findByDisplayValue(/First line/);
  fireEvent.change(textarea, { target: { value: "edited body" } });
  fireEvent.click(screen.getByText("Save"));
  await waitFor(() => expect(screen.getByText(/changed elsewhere/)).toBeInTheDocument());
  expect((screen.getByDisplayValue("edited body") as HTMLTextAreaElement).value).toBe("edited body");
  expect(notesList).toHaveBeenCalledTimes(2); // initial load + refetch after conflict
});

test("delete asks for confirmation then removes the note", async () => {
  notesList.mockResolvedValue([note]);
  vi.spyOn(window, "confirm").mockReturnValue(true);
  render(wrap(<KnowledgeScreen />));
  await waitFor(() => screen.getByText("First line"));
  fireEvent.click(screen.getByText("First line"));
  fireEvent.click(await screen.findByText("Delete"));
  await waitFor(() => expect(notesRemove).toHaveBeenCalledWith("n1", 1));
});

test("creating a note with a title calls notes.save", async () => {
  render(wrap(<KnowledgeScreen />));
  fireEvent.change(screen.getByPlaceholderText("Title (optional)"), { target: { value: "My title" } });
  fireEvent.change(screen.getByPlaceholderText("Note body..."), { target: { value: "new body" } });
  fireEvent.click(screen.getByText("Add note"));
  await waitFor(() => expect(notesSave).toHaveBeenCalledWith({ body: "new body", scope: "global", title: "My title" }));
});

test("sync sessions button reports a per-source summary", async () => {
  render(wrap(<KnowledgeScreen />));
  fireEvent.click(screen.getByText("Sync sessions"));
  await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/ingest/sessions", { method: "POST", body: {} }));
  await waitFor(() => expect(screen.getByText(/codex 1/)).toBeInTheDocument());
  expect(screen.getByText(/claude-code 38/)).toBeInTheDocument();
});
