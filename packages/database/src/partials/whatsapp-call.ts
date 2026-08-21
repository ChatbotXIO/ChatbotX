import { z } from "zod"

export const whatsappCallDirections = z.enum([
  "userInitiated",
  "businessInitiated",
])
export type WhatsappCallDirection = z.infer<typeof whatsappCallDirections>

/**
 * Lifecycle statuses reported by Meta's `calls` webhook field.
 *
 * `ringing`/`accepted`/`rejected` arrive as Call Status webhooks while the
 * call is live; `completed`/`failed` arrive on the terminal Call Terminate
 * webhook. A user-initiated call that was never accepted terminates as
 * `failed` — the UI derives "missed call" from that combination.
 */
export const whatsappCallStatuses = z.enum([
  "ringing",
  "accepted",
  "rejected",
  "completed",
  "failed",
])
export type WhatsappCallStatus = z.infer<typeof whatsappCallStatuses>
