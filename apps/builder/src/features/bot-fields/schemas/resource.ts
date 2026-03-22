import { botFieldModel, createSelectSchema } from "@aha.chat/database/schema"
import type z from "zod"

export const botFieldResource = createSelectSchema(botFieldModel)
export type BotFieldResource = z.infer<typeof botFieldResource>

export const publicBotFieldResource = botFieldResource.pick({
  id: true,
  name: true,
  type: true,
  value: true,
})
