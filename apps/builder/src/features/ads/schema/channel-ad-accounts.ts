import { zodBigintAsString } from "@chatbotx.io/utils"
import { adsEligibleChannelTypes } from "@chatbotx.io/utils/channel"
import { z } from "zod"

export const listChannelAdAccountsRequest = z.object({
  workspaceId: zodBigintAsString(),
  channel: adsEligibleChannelTypes,
  // Absent -> union across every connected integration's messaging-ads
  // connection for the channel, plus the workspace-wide fallback ("All
  // accounts"). Present -> narrows to that one integration's own connection.
  integrationId: zodBigintAsString().optional(),
  // Several integrations (the Analytics dashboard's inbox selection); wins
  // over `integrationId`. The union of exactly those integrations' accounts.
  integrationIds: z.array(zodBigintAsString()).min(1).max(200).optional(),
})
export type ListChannelAdAccountsRequest = z.infer<
  typeof listChannelAdAccountsRequest
>
