import { ORPCError } from "@orpc/client"

export function getClientErrorMessage(
  error: unknown,
  fallback: string,
): string {
  return error instanceof ORPCError ? error.message : fallback
}
