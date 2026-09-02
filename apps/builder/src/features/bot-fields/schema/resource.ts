import { botFieldModel, createSelectSchema } from "@chatbotx.io/database/schema"
import { z } from "zod"

export const botFieldResource = createSelectSchema(botFieldModel, {
  id: z.string(),
  workspaceId: z.string(),
})
export type BotFieldResource = z.infer<typeof botFieldResource>

export const publicBotFieldResource = botFieldResource.pick({
  id: true,
  name: true,
  type: true,
  value: true,
})
