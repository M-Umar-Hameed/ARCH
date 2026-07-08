import { beforeEach, expect, test, vi } from "vitest";
import { apiFetch, setFetchImpl, setSettingsImpl } from "./client.js";
import { AuthError, StaleVersionError, NotFoundError, ApiError } from "./errors.js";

beforeEach(() => {
  setSettingsImpl(async () => ({ baseUrl: "http://x", apiKey: "KEY" }));
});

function mockRes(status: number, body: any) {
  return { ok: status >= 200 && status < 300, status, statusText: "s", json: async () => body } as Response;
}

test("injects bearer + base url", async () => {
  const spy = vi.fn(async () => mockRes(200, { ok: 1 }));
  setFetchImpl(spy as any);
  await apiFetch("/tickets", {});
  expect(spy).toHaveBeenCalledWith("http://x/tickets", expect.objectContaining({
    headers: expect.objectContaining({ Authorization: "Bearer KEY" }),
  }));
});

test("maps status codes to typed errors", async () => {
  setFetchImpl((async () => mockRes(401, { error: "no" })) as any);
  await expect(apiFetch("/x", {})).rejects.toBeInstanceOf(AuthError);
  setFetchImpl((async () => mockRes(404, { error: "no" })) as any);
  await expect(apiFetch("/x", {})).rejects.toBeInstanceOf(NotFoundError);
  setFetchImpl((async () => mockRes(409, { error: "no" })) as any);
  await expect(apiFetch("/x", {})).rejects.toBeInstanceOf(StaleVersionError);
  setFetchImpl((async () => mockRes(500, { error: "no" })) as any);
  await expect(apiFetch("/x", {})).rejects.toBeInstanceOf(ApiError);
});

test("connection failure -> ApiError unreachable", async () => {
  setFetchImpl((async () => { throw new Error("refused"); }) as any);
  await expect(apiFetch("/x", {})).rejects.toMatchObject({ unreachable: true });
});
