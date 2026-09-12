import { z } from "zod"

/**
 * Lives here (not `@chatbotx.io/database`) so a "use client" component (e.g.
 * the broadcast flow-type selector) can read the enum without pulling in the
 * database package. `@chatbotx.io/database/partials` re-exports this for
 * existing backend importers. Mirrors the `channelTypes` precedent in
 * `./channel.ts`.
 */
export const broadcastFlowTypes = z.enum(["flow", "template"])
export type BroadcastFlowType = z.infer<typeof broadcastFlowTypes>

export const broadcastSubactions = z.enum([
  "allContacts",
  "messengerActiveContacts",
  "messengerTemplateMessage",
  "whatsappTemplateMessage",
  "whatsappWithin24Hours",
  "instagramActiveContacts",
  "telegramAllContacts",
  "tiktokActiveContacts",
])
export type BroadcastSubaction = z.infer<typeof broadcastSubactions>

/** The subactions that deliver a template (one template per page in a multi-page broadcast). */
export const templateBroadcastSubactions: readonly BroadcastSubaction[] = [
  "messengerTemplateMessage",
  "whatsappTemplateMessage",
]

export const isTemplateBroadcastSubaction = (
  subaction: BroadcastSubaction | null | undefined,
): boolean =>
  subaction ? templateBroadcastSubactions.includes(subaction) : false
