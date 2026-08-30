import { customFieldTypes } from "@chatbotx.io/database/partials"
import {
  createSelectSchema,
  customFieldModel,
} from "@chatbotx.io/database/schema"
import { zodFieldName } from "@chatbotx.io/flow-config"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

const customFieldResource = createSelectSchema(customFieldModel, {
  id: z.string(),
  workspaceId: z.string(),
  folderId: z.string().nullable(),
})

export const publicCustomFieldResource = customFieldResource.pick({
  id: true,
  name: true,
  type: true,
  description: true,
})
export type PublicCustomFieldResource = z.infer<
  typeof publicCustomFieldResource
>

export const publicListCustomFieldsResponse = z.object({
  data: z.array(publicCustomFieldResource),
})
export type PublicListCustomFieldsResponse = z.infer<
  typeof publicListCustomFieldsResponse
>

export const createCustomFieldInput = z.object({
  name: zodFieldName(),
  type: customFieldTypes,
})
export type CreateCustomFieldInput = z.infer<typeof createCustomFieldInput>

export const updateCustomFieldInput = z.object({
  id: zodBigintAsString(),
  name: zodFieldName(),
  description: z.string().optional(),
  folderId: zodBigintAsString().nullish(),
})
export type UpdateCustomFieldInput = z.infer<typeof updateCustomFieldInput>

export const getCustomFieldInput = z.object({ idOrName: z.string() })
export type GetCustomFieldInput = z.infer<typeof getCustomFieldInput>

export const deleteCustomFieldInput = z.object({ id: zodBigintAsString() })
export type DeleteCustomFieldInput = z.infer<typeof deleteCustomFieldInput>
