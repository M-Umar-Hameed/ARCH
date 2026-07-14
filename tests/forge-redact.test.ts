import { describe, it, expect } from "vitest";
import { redactSecrets } from "../src/forge/redact.js";

describe("redactSecrets", () => {
  it("redacts common key shapes", () => {
    expect(redactSecrets("key sk-abcdefghij0123456789 ok")).toBe("key [redacted] ok");
    expect(redactSecrets("voyage pa-AbCd_efgh-ij0123456789")).toBe("voyage [redacted]");
    expect(redactSecrets("Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.x.y")).toBe(
      "Authorization: [redacted]",
    );
    expect(redactSecrets('{"apiKey":"supersecretvalue123"}')).toBe('{"apiKey":"[redacted]"}');
  });
  it("leaves ordinary text alone", () => {
    const s = "git diff --stat shows 3 files, task passed";
    expect(redactSecrets(s)).toBe(s);
  });
});
