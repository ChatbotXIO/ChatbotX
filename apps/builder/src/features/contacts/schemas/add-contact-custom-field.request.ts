import { FieldOperationType } from "@aha.chat/flow-config"
import { z } from "zod"

export const addContactCustomFieldRequest = z.object({
  ids: z.array(z.cuid2()),
  customFieldId: z.cuid2(),
  operation: z.enum(FieldOperationType),
  value: z.string().trim(),
})
export type AddContactCustomFieldRequest = z.infer<
  typeof addContactCustomFieldRequest
>
