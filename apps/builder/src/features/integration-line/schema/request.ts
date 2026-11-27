import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

export const connectLineRequest = z.object({
  channelId: z
    .string()
    .trim()
    .min(1)
    .describe(
      "LINE Channel ID of the Messaging API channel. Find it in the LINE Developers console under the channel's Basic settings.",
    ),
  channelSecret: z
    .string()
    .trim()
    .min(1)
    .describe(
      "LINE Channel secret of the same channel (Basic settings). Used to issue access tokens and verify webhooks; it is never returned by the API.",
    ),
})

export type ConnectLineRequest = z.infer<typeof connectLineRequest>

export const lineChannelIdRequest = z.object({
  id: zodBigintAsString().describe(
    "LINE channel (integration) id. Get it from `lineChannels.list`.",
  ),
})
