import { z } from "zod"

export const channelIntegrationChannels = z.enum([
  "whatsapp",
  "messenger",
  "instagram",
  "zalo",
  "tiktok",
])
export type ChannelIntegrationChannel = z.infer<
  typeof channelIntegrationChannels
>
