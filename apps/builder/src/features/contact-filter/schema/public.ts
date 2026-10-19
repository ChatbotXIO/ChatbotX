import { formFieldTypes } from "@chatbotx.io/database/partials"
import { z } from "zod"
import { CONTACT_FILTER_SURFACES } from "./definitions"

export const listContactFilterFieldsPublicRequest = z.object({
  surface: z
    .enum(CONTACT_FILTER_SURFACES)
    .optional()
    .describe(
      "Where the filter will be used. `contacts` (default) = contacts, conversations and broadcast audiences; `flowCondition` = the flow Condition step, which also accepts runtime-only fields such as `isWithinWorkingHours`.",
    ),
})

const contactFilterFieldPublicResource = z.object({
  field: z.string(),
  schemaKind: z.enum([
    "boolean",
    "text",
    "multiSelect",
    "select",
    "datetime",
    "number",
  ]),
  optionSource: z.string(),
  operators: z.array(z.string()),
})
export type ContactFilterFieldPublicResource = z.infer<
  typeof contactFilterFieldPublicResource
>

const contactFilterCustomFieldPublicResource = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  valueType: formFieldTypes.describe(
    "Value type to put in a `contactFilter` condition's `valueType` for this field.",
  ),
})

const contactFilterTagPublicResource = z.object({
  id: z.string(),
  name: z.string(),
})

export const listContactFilterFieldsPublicResponse = z.object({
  staticFields: z.array(contactFilterFieldPublicResource),
  customFields: z.array(contactFilterCustomFieldPublicResource),
  botFields: z.array(contactFilterCustomFieldPublicResource),
  tags: z.array(contactFilterTagPublicResource),
})
export type ListContactFilterFieldsPublicResponse = z.infer<
  typeof listContactFilterFieldsPublicResponse
>
