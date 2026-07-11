import { expect, test } from "vitest";
import { fileHashBytes } from "../src/services/knowledge.js";

test("fileHashBytes: identical bytes hash equal, different bytes differ", () => {
  const a = Buffer.from([1, 2, 3, 255, 0]);
  const b = Buffer.from([1, 2, 3, 255, 0]);
  const c = Buffer.from([1, 2, 3, 255, 1]);
  expect(fileHashBytes(a)).toBe(fileHashBytes(b));
  expect(fileHashBytes(a)).not.toBe(fileHashBytes(c));
  expect(fileHashBytes(a)).toHaveLength(64);
});
