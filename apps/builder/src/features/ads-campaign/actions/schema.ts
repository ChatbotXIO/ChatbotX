import { z } from "zod"
import { messagingAdChannelSchema } from "../schema/wizard"

export const connectMessagingAdsRequest = z.object({
  channel: messagingAdChannelSchema,
})
export type ConnectMessagingAdsRequest = z.infer<
  typeof connectMessagingAdsRequest
>
