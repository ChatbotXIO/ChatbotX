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

const contactFilterFieldValueSourcePublicResource = z.object({
  operation: z
    .string()
    .optional()
    .describe(
      "Public operation that lists the selectable values (e.g. `flows.list`); absent for free-form fields. `Executed Step` takes `flowId:nodeId` — get node ids from `flows.listNodes`.",
    ),
  scope: z
    .string()
    .optional()
    .describe("API token scope that `operation` requires."),
  fixedValues: z
    .array(z.string())
    .describe(
      "Values accepted without being listed by `operation`, e.g. `noTopic` for emails sent without a topic.",
    ),
  valueFormat: z
    .enum(["id", "flowId:nodeId", "text", "datetime"])
    .describe(
      "Shape of a condition value: a bigint id, a `flowId:nodeId` pair, free text, or a date/time.",
    ),
  trackingStartedAt: z
    .string()
    .describe(
      "ISO time activity recording began. There is no backfill, so negative and empty operators mean 'since tracking began'.",
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
  valueSource: contactFilterFieldValueSourcePublicResource
    .optional()
    .describe(
      "Where to get this field's values and how far back its data goes. Present on the activity-backed fields (Executed Flow/Step, Keywords Received, Sent message, Last Delivered, Completed WhatsApp Flows, Email Sent/Delivered/Opened/Clicked).",
    ),
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
