import { z } from "zod"

export const channelResource = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(["messenger", "whatsapp", "zalo", "webchat"]),
})
export type ChannelResource = z.infer<typeof channelResource>

export const listChannelsResponse = z.object({
  data: z.array(channelResource),
})
export type ListChannelsResponse = z.infer<typeof listChannelsResponse>
