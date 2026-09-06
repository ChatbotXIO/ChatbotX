import { FieldOperationType } from "@chatbotx.io/flow-config"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

// The public API speaks friendly operation names (`increase`, not the
// internal `"O04"` opaque code `FieldOperationType.increase` maps to) so an
// LLM/API consumer never has to know the flow-step step's wire codes.
const publicFieldOperationNames = z.enum([
  "set",
  "append",
  "prepend",
  "increase",
  "decrease",
])
export type PublicFieldOperationName = z.infer<typeof publicFieldOperationNames>

export const publicFieldOperationNameToCode: Record<
  PublicFieldOperationName,
  FieldOperationType
> = {
  set: FieldOperationType.set,
  append: FieldOperationType.append,
  prepend: FieldOperationType.prepend,
  increase: FieldOperationType.increase,
  decrease: FieldOperationType.decrease,
}

const contactCustomFieldOperationPublicRequest = z.object({
  customFieldId: zodBigintAsString(),
  operation: publicFieldOperationNames,
  value: z.string().trim(),
})

export const addContactCustomFieldOperationsPublicRequest = z.object({
  identifier: z.string().min(1),
  operations: z.array(contactCustomFieldOperationPublicRequest).min(1).max(20),
})
export type AddContactCustomFieldOperationsPublicRequest = z.infer<
  typeof addContactCustomFieldOperationsPublicRequest
>
