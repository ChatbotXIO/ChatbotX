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

// Bot field ids are Snowflake bigints (> 2^53): a JSON number would lose
// precision, so they are digit strings. A plain integer is still accepted for
// callers written against the earlier numeric `id` field.
export const publicBotFieldIdSchema = z
  .union([zodBigintAsString(), z.number().int().positive().transform(String)])
  .describe("Bot field id (numeric string). Get it from `botFields.list`.")

export const resetBotFieldsRequest = z.object({
  ids: z
    .array(zodBigintAsString())
    .min(1)
    .max(100)
    .describe("Ids of the bot fields whose value is cleared back to empty."),
})
