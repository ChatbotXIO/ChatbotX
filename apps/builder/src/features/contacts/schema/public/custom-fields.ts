import { FieldOperationType } from "@chatbotx.io/flow-config"
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
  customFieldId: z
    .string()
    .min(1)
    .describe(
      "Custom field id (numeric string) or field name. Get either from `customFields.list`.",
    ),
  operation: publicFieldOperationNames.describe(
    "Operation to apply. `increase`/`decrease` treat the current value as a number and are a no-op if it isn't.",
  ),
  value: z
    .string()
    .trim()
    .describe("Operand: the value to set, append, prepend, or add/subtract."),
})

export const addContactCustomFieldOperationsPublicRequest = z.object({
  identifier: z
    .string()
    .min(1)
    .describe(
      "Contact identifier with a required prefix: id:123, email:ada@example.com, or phone:+841234567890. Bare ids, emails, phone numbers, and display names are invalid. For a name, search contacts.list and use id:<returned id>.",
    ),
  operations: z
    .array(contactCustomFieldOperationPublicRequest)
    .min(1)
    .max(20)
    .describe("Operations to apply in order, up to 20 per request."),
})
export type AddContactCustomFieldOperationsPublicRequest = z.infer<
  typeof addContactCustomFieldOperationsPublicRequest
>
