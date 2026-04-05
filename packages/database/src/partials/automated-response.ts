import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

export const replyTypes = z.enum(["text", "flow"])
export type ReplyType = z.infer<typeof replyTypes>

export const replyMessage = z.discriminatedUnion("type", [
  z.object({
    type: z.literal(replyTypes.enum.text),
    text: z.string(),
  }),
  z.object({
    type: z.literal(replyTypes.enum.flow),
    flowId: zodBigintAsString(),
  }),
])
