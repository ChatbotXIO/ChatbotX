import type { CustomFieldType } from "@chatbotx.io/database/partials"
import type { ExternalFieldType } from "./types"

/**
 * Which workspace field types can hold a source field's values: `default` is
 * the type a field is created with when nothing is mapped, `compatible` the
 * types a user may map it to. The single table behind mapping warnings, API
 * validation and the worker.
 */
export const externalFieldTypeTargets = {
  text: {
    default: "shortText",
    compatible: ["shortText", "longText", "email", "phoneNumber"],
  },
  number: { default: "number", compatible: ["number"] },
  date: { default: "date", compatible: ["date"] },
  datetime: { default: "datetime", compatible: ["datetime"] },
  boolean: { default: "boolean", compatible: ["boolean"] },
  json: { default: "longText", compatible: ["longText"] },
  array: { default: "longText", compatible: ["longText"] },
} as const satisfies Record<
  ExternalFieldType,
  { default: CustomFieldType; compatible: readonly CustomFieldType[] }
>

export const isCompatibleFieldType = (
  source: ExternalFieldType,
  target: CustomFieldType,
): boolean =>
  (externalFieldTypeTargets[source].compatible as readonly string[]).includes(
    target,
  )

/** A source value as the text the workspace normalizers read. */
export const externalValueToText = (value: string | boolean): string =>
  typeof value === "boolean" ? String(value) : value
