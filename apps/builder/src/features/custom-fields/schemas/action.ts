import {
  customFieldTypes,
  customFieldVisibilities,
} from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

export const createCustomFieldRequest = z.object({
  name: z.string().trim().min(1).max(255),
  type: customFieldTypes,
  folderId: zodBigintAsString().nullish(),
  description: z.string().nullish(),
  visibility: customFieldVisibilities.optional(),
  // Pra type="list" — opções pré-definidas (multi-select). Outros tipos ignoram.
  values: z.array(z.string().trim().min(1)).max(100).optional(),
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
  visibility: customFieldVisibilities.optional(),
  values: z.array(z.string().trim().min(1)).max(100).optional(),
})
export type UpdateCustomFieldRequest = z.infer<typeof updateCustomFieldRequest>
