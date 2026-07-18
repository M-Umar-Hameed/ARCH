import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ProjectProvider, useProject } from "./project.js";
import { projects } from "../api/projects.js";
import { load } from "@tauri-apps/plugin-store";

vi.mock("@tauri-apps/plugin-store", () => {
  const mockStore = { get: vi.fn(), set: vi.fn(), save: vi.fn(), delete: vi.fn() };
  return { load: vi.fn().mockResolvedValue(mockStore) };
});

vi.mock("../api/projects.js", () => ({
  projects: { list: vi.fn() }
}));

function Probe() {
  const { activeProjectId } = useProject();
  return <div data-testid="active">{activeProjectId ?? "none"}</div>;
}

describe("ProjectProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("restores a persisted id that exists in the loaded project list", async () => {
    vi.mocked(projects.list).mockResolvedValue([
      { id: "proj-1", name: "Project 1", key: "p1" },
      { id: "proj-2", name: "Project 2", key: "p2" }
    ] as any);
    
    const mockStore = await load("settings.json");
    vi.mocked(mockStore.get).mockResolvedValue("proj-2");

    render(
      <ProjectProvider>
        <Probe />
      </ProjectProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("active").textContent).toBe("proj-2");
    });
  });

  it("resolves to null when persisted id is absent from the loaded list", async () => {
    vi.mocked(projects.list).mockResolvedValue([
      { id: "proj-1", name: "Project 1", key: "p1" }
    ] as any);
    
    const mockStore = await load("settings.json");
    vi.mocked(mockStore.get).mockResolvedValue("missing-proj");

    render(
      <ProjectProvider>
        <Probe />
      </ProjectProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("active").textContent).toBe("none");
    });
  });
});
