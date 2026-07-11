import { expect, test } from "vitest";
import { detectLocalNode, setReadTextFileImpl } from "./settings.js";

test("detectLocalNode parses credentials and rejects malformed", async () => {
  setReadTextFileImpl(async () => JSON.stringify({ baseUrl: "http://localhost:8787", apiKey: "k".repeat(48) }));
  expect(await detectLocalNode()).toEqual({ baseUrl: "http://localhost:8787", apiKey: "k".repeat(48) });
  setReadTextFileImpl(async () => "not json");
  expect(await detectLocalNode()).toBeNull();
  setReadTextFileImpl(async () => { throw new Error("missing"); });
  expect(await detectLocalNode()).toBeNull();
});
