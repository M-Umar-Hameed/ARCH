import { describe, it, expect } from "vitest";
import { styleClause } from "../src/relay/style.js";

describe("styleClause", () => {
  it("returns empty string for off, undefined, null, or garbage", () => {
    expect(styleClause("off")).toBe("");
    expect(styleClause(undefined)).toBe("");
    expect(styleClause(null)).toBe("");
    expect(styleClause("garbage")).toBe("");
  });

  it("returns caveman clause with expected keywords", () => {
    const clause = styleClause("caveman");
    expect(clause).toBeTruthy();
    expect(clause).toMatch(/terse/i);
    expect(clause).toMatch(/substance|exact|identifiers/i);
    // Ensuring it mentions technical substance stays complete
    expect(clause).toMatch(/technical substance/i);
  });

  it("returns humanizer clause with expected keywords", () => {
    const clause = styleClause("humanizer");
    expect(clause).toBeTruthy();
    expect(clause).toMatch(/natural prose/i);
  });
});

import { roleStyle } from "../src/relay/style.js";

describe("roleStyle (role-mapped auto policy)", () => {
  it("is on by default and off only when explicitly off", () => {
    expect(roleStyle("plan", "off")).toBe("");
    expect(roleStyle("work", "off")).toBe("");
    expect(roleStyle("plan", "")).toContain("terse");
    expect(roleStyle("plan", undefined)).toContain("terse");
    expect(roleStyle("plan", "auto")).toContain("terse");
    expect(roleStyle("plan", "caveman")).toContain("terse"); // legacy values mean auto
  });
  it("maps roles: caveman internal, ponytail on work, review criteria only, humanizer chairman", () => {
    expect(roleStyle("work", "auto")).toContain("terse");
    expect(roleStyle("work", "auto")).toContain("minimum code");
    expect(roleStyle("review", "auto")).toContain("over-engineering");
    expect(roleStyle("review", "auto")).not.toContain("Communication style");
    expect(roleStyle("chairman", "auto")).toContain("natural prose");
  });
});
