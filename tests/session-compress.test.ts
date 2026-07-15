import { describe, it, expect } from "vitest";
import { compressSessionText } from "../src/ingest/sessions/compress.js";

describe("compressSessionText", () => {
  it("collapses runs of 3+ blank lines to one", () => {
    expect(compressSessionText("a\n\n\n\n\nb")).toBe("a\n\nb");
  });

  it("keeps a run of 2 blank lines untouched", () => {
    expect(compressSessionText("a\n\n\nb")).toBe("a\n\n\nb");
  });

  it("strips pure-decoration lines (dashes, equals, hashes, box-drawing)", () => {
    const text = "a\n---\nb\n===\nc\n###\nd\n───\ne";
    expect(compressSessionText(text)).toBe("a\nb\nc\nd\ne");
  });

  it("drops exact-duplicate consecutive lines", () => {
    expect(compressSessionText("same\nsame\nsame\ndiff")).toBe("same\ndiff");
  });

  it("truncates a single line over 2000 chars", () => {
    const result = compressSessionText("x".repeat(2_500));
    expect(result.length).toBe(2_001);
    expect(result.endsWith("…")).toBe(true);
  });

  it("collapses 2+ spaces to 1 outside code fences, preserves them inside", () => {
    const text = "hello    world\n```\nfoo    bar\n```\nafter    text";
    expect(compressSessionText(text)).toBe("hello world\n```\nfoo    bar\n```\nafter text");
  });
});
