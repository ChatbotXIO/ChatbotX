import {
  contactCustomFieldModel,
  createSelectSchema,
} from "@chatbotx.io/database/schema"
import { FieldOperationType } from "@chatbotx.io/flow-config"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { publicCustomFieldResource } from "@/features/custom-fields/schemas/resource"

export const contactCustomFieldResource = createSelectSchema(
  contactCustomFieldModel,
  {
    id: z.string(),
    contactId: z.string(),
    customFieldId: z.string(),
  },
)

export const addContactCustomFieldRequest = z.object({
  ids: z.array(zodBigintAsString()),
  customFieldId: zodBigintAsString(),
  operation: z.enum(FieldOperationType),
  value: z.string().trim(),
})
export type AddContactCustomFieldRequest = z.infer<
  typeof addContactCustomFieldRequest
>

export const deleteContactCustomFieldsRequest = z.object({
  ids: z.array(zodBigintAsString()),
  customFieldId: zodBigintAsString(),
})
export type DeleteContactCustomFieldsRequest = z.infer<
  typeof deleteContactCustomFieldsRequest
>

export const listContactCustomFieldsRequest = z.object({
  workspaceId: zodBigintAsString(),
  contactId: zodBigintAsString(),
})
export type ListContactCustomFieldsRequest = z.infer<
  typeof listContactCustomFieldsRequest
>

export const listContactCustomFieldsResponse = z.object({
  data: z.array(contactCustomFieldResource),
})
export type ListContactCustomFieldsResponse = z.infer<
  typeof listContactCustomFieldsResponse
>

export const setContactCustomFieldValueRequest = z.object({
  contactId: zodBigintAsString(),
  customFieldId: zodBigintAsString(),
  value: z.string().trim(),
})
export type SetContactCustomFieldValueRequest = z.infer<
  typeof setContactCustomFieldValueRequest
>

export const setBulkContactCustomFieldsRequest = z.object({
  contactId: zodBigintAsString(),
  fields: z
    .array(
      z.object({
        customFieldId: zodBigintAsString(),
        value: z.string().trim(),
      }),
    )
    .min(1)
    .max(20),
})
export type SetBulkContactCustomFieldsRequest = z.infer<
  typeof setBulkContactCustomFieldsRequest
>

export const deleteContactCustomFieldRequest = z.object({
  contactId: zodBigintAsString(),
  customFieldId: zodBigintAsString(),
})
export type DeleteContactCustomFieldRequest = z.infer<
  typeof deleteContactCustomFieldRequest
>

export const deleteBulkContactCustomFieldsRequest = z.object({
  contactId: zodBigintAsString(),
  keys: z.array(z.string().trim().min(1)).min(1),
})
export type DeleteBulkContactCustomFieldsRequest = z.infer<
  typeof deleteBulkContactCustomFieldsRequest
>

export const publicContactCustomFieldResource = publicCustomFieldResource.and(
  z.object({
    value: z.string(),
  }),
)
export type PublicContactCustomFieldResource = z.infer<
  typeof publicContactCustomFieldResource
>

export const listPublicContactCustomFieldsResponse = z.object({
  data: z.array(publicContactCustomFieldResource),
})
export type ListPublicContactCustomFieldsResponse = z.infer<
  typeof listPublicContactCustomFieldsResponse
>
