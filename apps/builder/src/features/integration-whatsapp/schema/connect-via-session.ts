import { z } from "zod"

/**
 * `transferPhoneNumber` was removed (Meta ends "Transfer phone" on
 * 2026-11-16). Still accepted as absent/`false` so an older client keeps
 * working; `true` is rejected instead of silently ignored.
 */
export const transferPhoneNumberField = z
  .boolean()
  .optional()
  .refine((value): boolean => value !== true, {
    message:
      "Transferring a phone number from another provider is no longer supported",
  })

/**
 * What the multi-select picker posts to the WhatsApp connect route, one
 * request per number. Deliberately NOT `connectWhatsappSchema`: the session
 * already holds the WABA, the access token and the workspace server-side, so
 * none of those may travel on this wire at all — the route can only ever act
 * on the session it names plus one candidate phone number id.
 *
 * Its own leaf module (zod and nothing else) so `channel-connect`'s registry
 * can type its route descriptor from this schema — `import type`, erased at
 * runtime — without importing this feature and creating a cycle.
 */
export const connectWhatsappViaSessionRequest = z.object({
  signupSessionId: z.string().min(1),
  phoneNumberId: z.string().min(1),
  connectExisting: z.boolean(),
  transferPhoneNumber: transferPhoneNumberField,
  // No longer read (see the connect form schema); accepted for older clients.
  marketingMessageLite: z.boolean().optional(),
})

/** The body that route accepts — the single source for every caller's typing. */
export type ConnectWhatsappViaSessionBody = z.infer<
  typeof connectWhatsappViaSessionRequest
>
