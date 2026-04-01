import {
  contactCustomFieldModel,
  createSelectSchema,
} from "@chatbotx.io/database/schema"
import { FieldOperationType } from "@chatbotx.io/flow-config"
import { z } from "zod"
import { publicCustomFieldResource } from "@/features/custom-fields/schemas/resource"

export const contactCustomFieldResource = createSelectSchema(
  contactCustomFieldModel,
)

export const addContactCustomFieldRequest = z.object({
  ids: z.array(z.bigint()),
  customFieldId: z.bigint(),
  operation: z.enum(FieldOperationType),
  value: z.string().trim(),
})
export type AddContactCustomFieldRequest = z.infer<
  typeof addContactCustomFieldRequest
>

export const deleteContactCustomFieldsRequest = z.object({
  ids: z.array(z.bigint()),
  customFieldId: z.bigint(),
})
export type DeleteContactCustomFieldsRequest = z.infer<
  typeof deleteContactCustomFieldsRequest
>

export const listContactCustomFieldsRequest = z.object({
  chatbotId: z.bigint(),
  contactId: z.bigint(),
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
  contactId: z.bigint(),
  customFieldId: z.bigint(),
  value: z.string().trim(),
})
export type SetContactCustomFieldValueRequest = z.infer<
  typeof setContactCustomFieldValueRequest
>

export const deleteContactCustomFieldRequest = z.object({
  contactId: z.bigint(),
  customFieldId: z.bigint(),
})
export type DeleteContactCustomFieldRequest = z.infer<
  typeof deleteContactCustomFieldRequest
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
