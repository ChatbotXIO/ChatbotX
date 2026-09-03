import { z } from "zod"

export type SanitizedCapiError = {
  message: string
  code?: string | number
}

/**
 * Structural check (an `Error` carrying an `issues` array) rather than
 * `instanceof ZodError`, so a second `zod` copy in the dependency graph
 * cannot make the check silently miss.
 */
export const isZodLikeError = (error: unknown): error is z.ZodError =>
  error instanceof Error &&
  Array.isArray((error as { issues?: unknown }).issues)

/**
 * Reduces an unknown CAPI/Ads-conversion send failure to a message+code
 * record safe to log — NEVER the raw error object. A Graph/
 * WhatsApp HTTP error's wrapped `origin` can carry the outgoing request,
 * including the Authorization header for manual CAPI tokens (see
 * `send-meta-capi-event.ts`'s inline comment on the same risk) — logging the
 * raw `Error` instance under an `err` key risks a logger serializer walking
 * every own-enumerable property, not just `.message`, and leaking it into log
 * storage. Every CAPI/ads-conversion terminal-failure log MUST go through
 * this instead of `err: error`.
 */
export function sanitizeCapiError(error: unknown): SanitizedCapiError {
  if (error instanceof Error) {
    const code = (error as { code?: unknown }).code
    return {
      // A zod error's `.message` is a JSON dump of its issues; the pretty
      // form ("✖ … → at value") is what belongs in a step error message.
      message: isZodLikeError(error) ? z.prettifyError(error) : error.message,
      ...(typeof code === "string" || typeof code === "number" ? { code } : {}),
    }
  }

  return { message: typeof error === "string" ? error : "Unknown error" }
}
