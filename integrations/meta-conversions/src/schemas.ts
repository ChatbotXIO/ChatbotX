import { z } from "zod"

export const metaMessagingChannelSchema = z.enum([
  "messenger",
  "instagram",
  "whatsapp",
])
export type MetaMessagingChannel = z.infer<typeof metaMessagingChannelSchema>

export const metaCapiEventNameSchema = z.enum(["LeadSubmitted"])
export type MetaCapiEventName = z.infer<typeof metaCapiEventNameSchema>
