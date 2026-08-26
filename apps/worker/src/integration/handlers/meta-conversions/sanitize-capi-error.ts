export type SanitizedCapiError = {
  message: string
  code?: string | number
}

/**
 * Reduces an unknown CAPI/Ads-conversion send failure to a message+code
 * record safe to log — NEVER the raw error object (Codex #7). A Graph/
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
      message: error.message,
      ...(typeof code === "string" || typeof code === "number" ? { code } : {}),
    }
  }

  return { message: typeof error === "string" ? error : "Unknown error" }
}
