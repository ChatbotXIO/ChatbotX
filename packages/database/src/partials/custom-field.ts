import z from "zod"

/**
 * `customFieldTypes` is defined in `@chatbotx.io/utils/custom-field` so
 * packages that cannot depend on the database layer (notably
 * `@chatbotx.io/flow-config`) can still use the enum. Re-exported here
 * because this has long been the import site for the rest of the repo; both
 * paths resolve to the same enum. Mirrors the `channelTypes` precedent.
 */
export {
  type CustomFieldType,
  customFieldTypes,
} from "@chatbotx.io/utils/custom-field"

export const operatorTypes = z.enum([
  "in",
  "notIn",
  "isEmpty",
  "isNotEmpty",
  "eq",
  "ne",
  "startsWith",
  "endsWith",
  "contains",
  "notContains",
  "lt",
  "lte",
  "gt",
  "gte",
  "isBetween",
  "notBetween",
  "used",
])
export type OperatorType = z.infer<typeof operatorTypes>

export const formFieldTypes = z.enum([
  "multiSelect",
  "select",
  "text",
  "boolean",
  "datetime",
  "number",
])
export type FormFieldType = z.infer<typeof formFieldTypes>

export const dateTimeTriggerTypes = z.enum(["atTheDayOf", "before", "after"])
export type DateTimeTriggerType = z.infer<typeof dateTimeTriggerTypes>
