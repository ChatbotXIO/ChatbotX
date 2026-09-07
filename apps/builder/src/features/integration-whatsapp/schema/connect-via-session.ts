import { z } from "zod"

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
  transferPhoneNumber: z.boolean(),
  marketingMessageLite: z.boolean(),
})

/** The body that route accepts — the single source for every caller's typing. */
export type ConnectWhatsappViaSessionBody = z.infer<
  typeof connectWhatsappViaSessionRequest
>
