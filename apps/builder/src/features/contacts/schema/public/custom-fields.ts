import { z } from "zod"
import { publicContactIdentifier } from "@/lib/public-api/contact-identifier"
import {
  publicFieldOperationFields,
  requireOperandForOperation,
} from "@/lib/public-api/field-operation"
import { ianaTimezoneSchema } from "@/lib/public-api/iana-timezone"

const contactCustomFieldOperationPublicRequest = z
  .object({
    customFieldId: z
      .string()
      .min(1)
      .describe(
        "Custom field id (numeric string) or field name. Get either from `customFields.list`.",
      ),
    ...publicFieldOperationFields,
  })
  .superRefine(requireOperandForOperation)

export const addContactCustomFieldOperationsPublicRequest = z.object({
  identifier: publicContactIdentifier,
  operations: z
    .array(contactCustomFieldOperationPublicRequest)
    .min(1)
    .max(20)
    .describe("Operations to apply in order, up to 20 per request."),
  clientTimezone: ianaTimezoneSchema
    .optional()
    .describe(
      "IANA timezone of the caller, e.g. `Asia/Ho_Chi_Minh`. Anchors a date-only value to that calendar day; defaults to the contact's, then the workspace's zone.",
    ),
})
export type AddContactCustomFieldOperationsPublicRequest = z.infer<
  typeof addContactCustomFieldOperationsPublicRequest
>
