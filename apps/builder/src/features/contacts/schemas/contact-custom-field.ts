import {
  contactCustomFieldModel,
  createSelectSchema,
} from "@aha.chat/database/schema"
import { FieldOperationType } from "@aha.chat/flow-config"
import { z } from "zod"

export const contactCustomFieldResource = createSelectSchema(
  contactCustomFieldModel,
)

export const addContactCustomFieldRequest = z.object({
  ids: z.array(z.cuid2()),
  customFieldId: z.cuid2(),
  operation: z.enum(FieldOperationType),
  value: z.string().trim(),
})
export type AddContactCustomFieldRequest = z.infer<
  typeof addContactCustomFieldRequest
>

export const deleteContactCustomFieldsRequest = z.object({
  ids: z.array(z.cuid2()),
  customFieldId: z.cuid2(),
})
export type DeleteContactCustomFieldsRequest = z.infer<
  typeof deleteContactCustomFieldsRequest
>

export const listContactCustomFieldsRequest = z.object({
  chatbotId: z.cuid2(),
  contactId: z.cuid2(),
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
  contactId: z.cuid2(),
  customFieldId: z.cuid2(),
  value: z.string().trim(),
})
export type SetContactCustomFieldValueRequest = z.infer<
  typeof setContactCustomFieldValueRequest
>

export const deleteContactCustomFieldRequest = z.object({
  contactId: z.cuid2(),
  customFieldId: z.cuid2(),
})
export type DeleteContactCustomFieldRequest = z.infer<
  typeof deleteContactCustomFieldRequest
>
