import z from "zod"

export const customFieldTypes = z.enum([
  "shortText",
  "email",
  "phoneNumber",
  "number",
  "date",
  "datetime",
  "boolean",
  "longText",
])
export type CustomFieldType = z.infer<typeof customFieldTypes>

export const operatorTypes = z.enum([
  "is",
  "isNot",
  "hasAnyValue",
  "hasNoValue",
  "greaterThan",
  "lessThan",
  "greaterThanOrEqualTo",
  "lessThanOrEqualTo",
  "contains",
  "doesNotContain",
  "startsWith",
  "endsWith",
  "interval",
  "notInterval",
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
