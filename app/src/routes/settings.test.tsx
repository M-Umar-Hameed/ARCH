import { expect, test, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("../api/projects.js", () => ({ projects: { list: vi.fn(async () => []) } }));
vi.mock("../settings.js", () => ({ getSettings: vi.fn(async () => ({ baseUrl: "", apiKey: "" })), saveSettings: vi.fn(async () => {}), detectLocalNode: vi.fn(async () => null) }));

// SettingsScreen is now tabbed; the connection UI lives in LocalNodeTab, which
// defaults to the "integrations" tab when rendered via SettingsScreen. Render
// LocalNodeTab directly to test the connection-test path.
import { LocalNodeTab } from "../components/settings/LocalNodeTab.js";

test("Test Link shows CONNECTED on success", async () => {
  render(<LocalNodeTab rejected={false} />);
  fireEvent.click(screen.getByText("Test Link"));
  await waitFor(() => expect(screen.getByText("CONNECTED")).toBeInTheDocument());
});
