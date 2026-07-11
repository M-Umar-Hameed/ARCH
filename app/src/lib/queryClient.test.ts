import { expect, test, vi } from "vitest";
import { queryClient, setAuthErrorHandler, isAuthRejected, clearAuthRejected } from "./queryClient.js";
import { AuthError } from "../api/errors.js";

test("a 401 (AuthError) fires the handler and sets the rejected flag", () => {
  clearAuthRejected();
  const spy = vi.fn();
  setAuthErrorHandler(spy);
  // Fire the QueryCache's configured onError as a real query failure would.
  queryClient.getQueryCache().config.onError?.(new AuthError("no"), {} as never);
  expect(spy).toHaveBeenCalledOnce();
  expect(isAuthRejected()).toBe(true);
  clearAuthRejected();
  expect(isAuthRejected()).toBe(false);
});

test("a non-auth error does not trigger the bounce", () => {
  clearAuthRejected();
  const spy = vi.fn();
  setAuthErrorHandler(spy);
  queryClient.getQueryCache().config.onError?.(new Error("boom"), {} as never);
  expect(spy).not.toHaveBeenCalled();
  expect(isAuthRejected()).toBe(false);
});
