import { QueryClient, QueryCache, MutationCache } from "@tanstack/react-query";
import { AuthError } from "../api/errors.js";

// A 401 anywhere (bad or rotated key) routes the user back to Settings.
let authHandler: () => void = () => {};
export function setAuthErrorHandler(fn: () => void) { authHandler = fn; }

let rejected = false;
export function isAuthRejected(): boolean { return rejected; }
export function clearAuthRejected() { rejected = false; }

function handle(err: unknown) {
  if (err instanceof AuthError) { rejected = true; authHandler(); }
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: handle }),
  mutationCache: new MutationCache({ onError: handle }),
  defaultOptions: { queries: { refetchOnWindowFocus: true, retry: 1 } },
});
