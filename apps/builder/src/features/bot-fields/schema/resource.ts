import { botFieldModel, createSelectSchema } from "@chatbotx.io/database/schema"
import { z } from "zod"

export const botFieldResource = createSelectSchema(botFieldModel, {
  id: z.string(),
  workspaceId: z.string(),
})
export type BotFieldResource = z.infer<typeof botFieldResource>

export const publicBotFieldResource = botFieldResource
  .pick({
    id: true,
    name: true,
    type: true,
    value: true,
    description: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    folderId: z
      .string()
      .nullable()
      .describe(
        "Folder the field is in (a `customField` folder from `folders.list`), or null at the root.",
      ),
  })
