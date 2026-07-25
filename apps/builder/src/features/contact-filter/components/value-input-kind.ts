import {
  type FormFieldType,
  formFieldTypes,
} from "@chatbotx.io/database/partials"
import type {
  CustomFieldValueInputConfig,
  CustomFieldValueInputKind,
} from "./custom-field-filter-config"

export type ValueInputKind =
  | CustomFieldValueInputKind
  | "select"
  | "multiSelect"

export const resolveValueInputKind = (
  input: CustomFieldValueInputConfig | undefined,
  valueType: FormFieldType | null,
): ValueInputKind => {
  if (input) {
    return input.kind
  }

  switch (valueType) {
    case formFieldTypes.enum.select:
      return "select"
    case formFieldTypes.enum.multiSelect:
      return "multiSelect"
    case formFieldTypes.enum.text:
      return "text"
    case formFieldTypes.enum.number:
      return "number"
    case formFieldTypes.enum.datetime:
      return "datetime"
    case formFieldTypes.enum.boolean:
      return "boolean"
    default:
      return "none"
  }
}

export const DATETIME_VALUE_INPUT_KINDS = new Set<ValueInputKind>([
  "date",
  "datetime",
  "datetimeInterval",
])
