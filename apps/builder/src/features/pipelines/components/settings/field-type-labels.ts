import type { CustomFieldType } from "@chatbotx.io/utils/custom-field"

export const FIELD_TYPE_LABEL_KEYS = {
  shortText: "fields.shortText.label",
  longText: "fields.longText.label",
  email: "fields.email.label",
  phoneNumber: "fields.phoneNumber.label",
  number: "fields.number.label",
  date: "fields.date.label",
  datetime: "fields.datetime.label",
  boolean: "fields.boolean.label",
} as const satisfies Record<CustomFieldType, string>
