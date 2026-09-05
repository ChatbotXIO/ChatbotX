import { ORPCError } from "@orpc/client"

/**
 * Single source of truth for turning a caught error into a user-facing
 * message: an `ORPCError`'s message came from the server (or a
 * status/code-derived default — `ORPCError` never has an empty message) and
 * is safe to show, anything else (including a raw `@orpc/client`
 * parse-error string) falls back to the caller-supplied message instead of
 * leaking internals.
 */
export function getClientErrorMessage(
  error: unknown,
  fallback: string,
): string {
  return error instanceof ORPCError ? error.message : fallback
}
