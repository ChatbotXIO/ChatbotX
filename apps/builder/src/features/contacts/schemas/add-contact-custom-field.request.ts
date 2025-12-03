import { FieldOperationType } from "@aha.chat/database/types"
import { z } from "zod"

export const addContactCustomFieldRequest = z.object({
  ids: z.array(z.cuid2()),
  customFieldName: z.string(),
  operation: z.enum(FieldOperationType),
  value: z.union([z.string(), z.number()]),
})
export type AddContactCustomFieldRequest = z.infer<
  typeof addContactCustomFieldRequest
>
