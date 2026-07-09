import type { ContactFilterField } from "@chatbotx.io/database/partials"
import { contactFilterFields } from "@chatbotx.io/database/partials"
import { staticFieldFilter } from "./static-field-filter"

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
  | "languages"
  | "countries"
  | "continents"
  | "gender"
  | "contactSources"
  | "channels"
  | "inboxes"
  | "tags"
  | "flows"

export type ContactFilterFieldDefinition = {
  field: ContactFilterField
  schemaKind: ContactFilterSchemaKind
  optionSource: ContactFilterOptionSource
}

const conditionSchemaForDef = (def: ContactFilterFieldDefinition) =>
  staticFieldFilter(def.field)

/**
 * One row per supported filter field: drives Zod `contactFilter` conditions and UI `FieldConfig`.
 * Keep ordering aligned with product (combobox order).
 */
export const CONTACT_FILTER_FIELD_DEFINITIONS = [
  {
    field: contactFilterFields.enum.locale,
    schemaKind: "multiSelect",
    optionSource: "languages",
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
    field: contactFilterFields.enum.source,
    schemaKind: "multiSelect",
    optionSource: "contactSources",
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
    field: contactFilterFields.enum.followUp,
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
    field: contactFilterFields.enum.currentChannel,
    schemaKind: "multiSelect",
    optionSource: "channels",
  },
  {
    field: contactFilterFields.enum.inbox,
    schemaKind: "multiSelect",
    optionSource: "inboxes",
  },
  {
    field: contactFilterFields.enum.timezone,
    schemaKind: "text",
    optionSource: "none",
  },
  {
    field: contactFilterFields.enum.lastSeen,
    schemaKind: "datetime",
    optionSource: "none",
  },
  {
    field: contactFilterFields.enum.lastInteraction,
    schemaKind: "datetime",
    optionSource: "none",
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
    field: contactFilterFields.enum.emailWasVerified,
    schemaKind: "boolean",
    optionSource: "none",
  },
  {
    field: contactFilterFields.enum.optedInForEmail,
    schemaKind: "boolean",
    optionSource: "none",
  },
] as const satisfies readonly ContactFilterFieldDefinition[]

export const contactFilterConditionSchemas =
  CONTACT_FILTER_FIELD_DEFINITIONS.map((def) => conditionSchemaForDef(def))
