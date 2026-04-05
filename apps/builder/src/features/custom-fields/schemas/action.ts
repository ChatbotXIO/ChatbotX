import { customFieldTypes } from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

export const createCustomFieldRequest = z.object({
  name: z.string().trim().min(1).max(255),
  type: customFieldTypes,
  folderId: zodBigintAsString().nullish(),
  description: z.string().nullish(),
})
export type CreateCustomFieldRequest = z.infer<typeof createCustomFieldRequest>

export const createCustomFieldResponse = z.object({
  id: zodBigintAsString(),
})
export type CreateCustomFieldResponse = z.infer<
  typeof createCustomFieldResponse
>

export const updateCustomFieldRequest = z.object({
  name: z.string().trim().min(1).max(255),
  description: z.string().optional(),
  folderId: zodBigintAsString().nullish(),
})
export type UpdateCustomFieldRequest = z.infer<typeof updateCustomFieldRequest>
