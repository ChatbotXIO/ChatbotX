import { customFieldTypes } from "@chatbotx.io/database/partials"
import { zodFieldName } from "@chatbotx.io/flow-config"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

export const createCustomFieldRequest = z.object({
  name: zodFieldName().describe(
    "Custom field name, used to reference it in flows.",
  ),
  type: customFieldTypes.describe("Custom field data type."),
  folderId: zodBigintAsString()
    .nullish()
    .describe("Folder to place the field in, or null for root-level."),
  description: z.string().nullish().describe("Optional internal description."),
})
export type CreateCustomFieldRequest = z.infer<typeof createCustomFieldRequest>

export const updateCustomFieldRequest = z.object({
  name: zodFieldName().describe("New custom field name."),
  description: z.string().optional().describe("Optional internal description."),
  folderId: zodBigintAsString()
    .nullish()
    .describe("Folder to place the field in, or null for root-level."),
})
export type UpdateCustomFieldRequest = z.infer<typeof updateCustomFieldRequest>
