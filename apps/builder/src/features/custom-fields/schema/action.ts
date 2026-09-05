import { customFieldTypes } from "@chatbotx.io/database/partials"
import { zodFieldName } from "@chatbotx.io/flow-config"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

export const createCustomFieldRequest = z.object({
  name: zodFieldName(),
  type: customFieldTypes,
  folderId: zodBigintAsString().nullish(),
  description: z.string().nullish(),
})
export type CreateCustomFieldRequest = z.infer<typeof createCustomFieldRequest>

export const updateCustomFieldRequest = z.object({
  name: zodFieldName(),
  description: z.string().optional(),
  folderId: zodBigintAsString().nullish(),
})
export type UpdateCustomFieldRequest = z.infer<typeof updateCustomFieldRequest>
