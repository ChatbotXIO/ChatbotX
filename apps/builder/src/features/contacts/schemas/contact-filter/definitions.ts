import type { ContactFilterField } from "@chatbotx.io/database/partials"
import { contactFilterFields } from "@chatbotx.io/database/partials"
import { booleanFilter } from "./boolean-filter"
import { datetimeFilter } from "./datetime-filter"
import { multiSelectFilter } from "./multi-select-filter"
import { numberFilter } from "./number"
import { selectFilter } from "./select-filter"
import { textFilter } from "./text-filter"

/**
 * Shape of value input + which Zod branch (`booleanFilter`, `textFilter`, …) applies.
 * Single source of truth: each contact filter field appears exactly once in
 * {@link CONTACT_FILTER_FIELD_DEFINITIONS}.
 */
export type ContactFilterSchemaKind =
  | "boolean"
  | "text"
  | "multiSelect"
  | "select"
  | "datetime"
  | "number"

/**
 * How the builder UI resolves static/dynamic option lists (tags, flows, …).
 */
export type ContactFilterOptionSource =
  | "none"
  | "countries"
  | "continents"
  | "gender"
  | "channels"
  | "channelsNoTelegram"
  | "tags"
  | "customFields"
  | "flows"

export type ContactFilterFieldDefinition = {
  field: ContactFilterField
  schemaKind: ContactFilterSchemaKind
  optionSource: ContactFilterOptionSource
}

const conditionSchemaForDef = (def: ContactFilterFieldDefinition) => {
  const { field, schemaKind } = def
  switch (schemaKind) {
    case "boolean":
      return booleanFilter(field)
    case "text":
      return textFilter(field)
    case "multiSelect":
      return multiSelectFilter(field)
    case "select":
      return selectFilter(field)
    case "datetime":
      return datetimeFilter(field)
    case "number":
      return numberFilter(field)
    default: {
      const _exhaustive: never = schemaKind
      return _exhaustive
    }
  }
}

/**
 * One row per supported filter field: drives Zod `contactFilter` conditions and UI `FieldConfig`.
 * Keep ordering aligned with product (combobox order).
 */
export const CONTACT_FILTER_FIELD_DEFINITIONS = [
  {
    field: contactFilterFields.enum.locale,
    schemaKind: "multiSelect",
    optionSource: "countries",
  },
  {
    field: contactFilterFields.enum.fullName,
    schemaKind: "text",
    optionSource: "none",
  },
  {
    field: contactFilterFields.enum.country,
    schemaKind: "multiSelect",
    optionSource: "countries",
  },
  {
    field: contactFilterFields.enum.continent,
    schemaKind: "multiSelect",
    optionSource: "continents",
  },
  {
    field: contactFilterFields.enum.gender,
    schemaKind: "select",
    optionSource: "gender",
  },
  {
    field: contactFilterFields.enum.subscribedToBroadcast,
    schemaKind: "boolean",
    optionSource: "none",
  },
  {
    field: contactFilterFields.enum.contactCreatedAt,
    schemaKind: "datetime",
    optionSource: "none",
  },
  {
    field: contactFilterFields.enum.contactCreatedDateMinutesAgo,
    schemaKind: "number",
    optionSource: "none",
  },
  {
    field: contactFilterFields.enum.source,
    schemaKind: "multiSelect",
    optionSource: "channels",
  },
  {
    field: contactFilterFields.enum.conversationTransferredToHuman,
    schemaKind: "boolean",
    optionSource: "none",
  },
  {
    field: contactFilterFields.enum.interactedInLast24h,
    schemaKind: "boolean",
    optionSource: "none",
  },
  {
    field: contactFilterFields.enum.archived,
    schemaKind: "boolean",
    optionSource: "none",
  },
  {
    field: contactFilterFields.enum.blocked,
    schemaKind: "boolean",
    optionSource: "none",
  },
  {
    field: contactFilterFields.enum.existingContact,
    schemaKind: "boolean",
    optionSource: "none",
  },
  {
    field: contactFilterFields.enum.currentChannel,
    schemaKind: "multiSelect",
    optionSource: "channelsNoTelegram",
  },
  {
    field: contactFilterFields.enum.email,
    schemaKind: "text",
    optionSource: "none",
  },
  {
    field: contactFilterFields.enum.phone,
    schemaKind: "text",
    optionSource: "none",
  },
  {
    field: contactFilterFields.enum.tags,
    schemaKind: "multiSelect",
    optionSource: "tags",
  },
  {
    field: contactFilterFields.enum.customFields,
    schemaKind: "multiSelect",
    optionSource: "customFields",
  },
  {
    field: contactFilterFields.enum.executedFlow,
    schemaKind: "select",
    optionSource: "flows",
  },
] as const satisfies readonly ContactFilterFieldDefinition[]

export const contactFilterConditionSchemas =
  CONTACT_FILTER_FIELD_DEFINITIONS.map((def) => conditionSchemaForDef(def))
