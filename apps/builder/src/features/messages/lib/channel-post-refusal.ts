import { channelPostShareRefusalReasons } from "@chatbotx.io/utils/channel-post"
import { z } from "zod"

const channelPostRefusedResultSchema = z.object({
  channelPostRefused: z.object({
    reason: z.enum(channelPostShareRefusalReasons),
  }),
})

/**
 * The typed refusal `createMessageAction` returns (not throws) when the post
 * cannot be sent, so the composer can word it in the agent's language.
 */
export const getChannelPostRefusal = (data: unknown) => {
  const parsed = channelPostRefusedResultSchema.safeParse(data)
  return parsed.success ? parsed.data.channelPostRefused : undefined
}
