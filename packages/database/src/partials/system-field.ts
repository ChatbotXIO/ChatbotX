import z from "zod"
import { channelTypes } from "./channel"

export const systemFieldRowTypes = z.enum(["me"])
export type SystemFieldRowType = z.infer<typeof systemFieldRowTypes>

export const meSystemFieldPayload = z.object({
  workspaceId: z.string(),
  channel: channelTypes,
  integrationId: z.string(),
  sourceId: z.string(),
  contactInboxId: z.string(),
  conversationId: z.string().optional(),
  contactId: z.string(),
})

export type MeSystemFieldPayload = z.infer<typeof meSystemFieldPayload>
export type SystemFieldPayload = MeSystemFieldPayload
