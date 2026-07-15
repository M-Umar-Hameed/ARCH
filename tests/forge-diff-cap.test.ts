import { describe, it, expect } from "vitest";
import { reviewDiffPayload, DIFF_PROMPT_CAP } from "../src/forge/runs.js";

describe("reviewDiffPayload", () => {
  it("returns the diff unchanged when under the cap", () => {
    const diff = "diff --git a/x b/x\n+hello\n";
    expect(reviewDiffPayload(diff, "1 file changed")).toBe(diff);
  });

  it("caps oversized diffs to stat + truncated content", () => {
    const diff = "x".repeat(DIFF_PROMPT_CAP + 5_000);
    const stat = "3 files changed, 10 insertions(+)";
    const payload = reviewDiffPayload(diff, stat);
    expect(payload).toContain(stat);
    expect(payload).toContain("diff too large");
    expect(payload.length).toBeLessThan(diff.length);
    expect(payload).toContain(diff.slice(0, 100));
  });
});
