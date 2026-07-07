import { expect, test } from "vitest";
import { createActor, resolveActor, hashKey } from "../src/services/actors.js";
import { AuthError } from "../src/services/errors.js";

test("created actor can be resolved by its key, wrong key rejected", async () => {
  const { actor, apiKey } = await createActor({ name: "tester", kind: "human" });
  expect(hashKey(apiKey)).toHaveLength(64);
  const resolved = await resolveActor(apiKey);
  expect(resolved.id).toBe(actor.id);
  await expect(resolveActor("nope")).rejects.toBeInstanceOf(AuthError);
});
