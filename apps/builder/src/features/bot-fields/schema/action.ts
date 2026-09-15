import { customFieldTypes } from "@chatbotx.io/database/partials"
import { zodFieldName } from "@chatbotx.io/flow-config"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

export const createBotFieldRequest = z.object({
  name: zodFieldName().describe(
    "Bot field name, used to reference it in flows.",
  ),
  type: customFieldTypes.describe("Bot field data type."),
  value: z
    .string()
    .trim()
    .max(1000)
    .nullable()
    .describe("Initial value, or null for none."),
  description: z
    .string()
    .max(1000)
    .nullable()
    .describe("Optional internal description."),
  folderId: zodBigintAsString()
    .nullish()
    .describe("Folder to place the field in, or null for root-level."),
})
export type CreateBotFieldRequest = z.infer<typeof createBotFieldRequest>

export const updateBotFieldRequest = createBotFieldRequest.partial()
export type UpdateBotFieldRequest = z.infer<typeof updateBotFieldRequest>
