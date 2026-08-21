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
  | "contactInfoFilterValues"
  | "languages"
  | "timezones"
  | "countries"
  | "continents"
  | "gender"
  | "lastUserInputTypes"
  | "contactSources"
  | "channels"
  | "inboxes"
  | "tags"
  | "flows"
  | "broadcasts"
  | "sequences"
  | "reflinks"
  | "assignees"
  | "ctwaConversionTypes"

export type ContactFilterFieldDefinition = {
  field: ContactFilterField
  schemaKind: ContactFilterSchemaKind
  optionSource: ContactFilterOptionSource
  /**
   * Kept valid in the Zod schema and rendered for existing conditions, but
   * hidden from the "add condition" picker. Use to retire a field from new use
   * (e.g. superseded by another) without breaking saved filters/broadcasts.
   */
  hidden?: boolean
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
    // Superseded by inbox-level `language`; hidden from the picker but still
    // valid so existing saved filters keep resolving.
    hidden: true,
  },
  {
    field: contactFilterFields.enum.language,
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
    schemaKind: "multiSelect",
    optionSource: "timezones",
  },
  {
    field: contactFilterFields.enum.lastSeen,
    schemaKind: "datetime",
    optionSource: "none",
  },
  {
    field: contactFilterFields.enum.lastSent,
    schemaKind: "datetime",
    optionSource: "none",
  },
  {
    field: contactFilterFields.enum.lastInteraction,
    schemaKind: "datetime",
    optionSource: "none",
  },
  {
    field: contactFilterFields.enum.contactCreatedDateMinutesAgo,
    schemaKind: "number",
    optionSource: "none",
  },
  {
    field: contactFilterFields.enum.lastSeenMinutesAgo,
    schemaKind: "number",
    optionSource: "none",
  },
  {
    field: contactFilterFields.enum.lastInteractionMinutesAgo,
    schemaKind: "number",
    optionSource: "none",
  },
  {
    field: contactFilterFields.enum.lastUserInput,
    schemaKind: "text",
    optionSource: "none",
  },
  {
    field: contactFilterFields.enum.lastComment,
    schemaKind: "text",
    optionSource: "none",
  },
  {
    field: contactFilterFields.enum.lastUserInputType,
    schemaKind: "select",
    optionSource: "lastUserInputTypes",
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
    field: contactFilterFields.enum.hasContactInfo,
    schemaKind: "multiSelect",
    optionSource: "contactInfoFilterValues",
  },
  {
    field: contactFilterFields.enum.tags,
    schemaKind: "multiSelect",
    optionSource: "tags",
  },
  {
    field: contactFilterFields.enum.broadcastSent,
    schemaKind: "multiSelect",
    optionSource: "broadcasts",
  },
  {
    field: contactFilterFields.enum.broadcastDelivered,
    schemaKind: "multiSelect",
    optionSource: "broadcasts",
  },
  {
    field: contactFilterFields.enum.broadcastSeen,
    schemaKind: "multiSelect",
    optionSource: "broadcasts",
  },
  {
    field: contactFilterFields.enum.broadcastClicked,
    schemaKind: "multiSelect",
    optionSource: "broadcasts",
  },
  {
    field: contactFilterFields.enum.broadcastFailed,
    schemaKind: "multiSelect",
    optionSource: "broadcasts",
  },
  {
    field: contactFilterFields.enum.subscribedToDripCampaign,
    schemaKind: "multiSelect",
    optionSource: "sequences",
  },
  {
    field: contactFilterFields.enum.entryPointsLinks,
    schemaKind: "multiSelect",
    optionSource: "reflinks",
  },
  {
    field: contactFilterFields.enum.questionnaireStarted,
    schemaKind: "boolean",
    optionSource: "none",
  },
  {
    field: contactFilterFields.enum.questionnaireInProgress,
    schemaKind: "boolean",
    optionSource: "none",
  },
  {
    field: contactFilterFields.enum.questionnaireFinished,
    schemaKind: "boolean",
    optionSource: "none",
  },
  {
    field: contactFilterFields.enum.conversationAssigned,
    schemaKind: "multiSelect",
    optionSource: "assignees",
  },
  {
    field: contactFilterFields.enum.unreplied,
    schemaKind: "boolean",
    optionSource: "none",
  },
  {
    field: contactFilterFields.enum.unread,
    schemaKind: "boolean",
    optionSource: "none",
  },
  {
    field: contactFilterFields.enum.existingContact,
    schemaKind: "boolean",
    optionSource: "none",
    // Superseded by `hasContactInfo`; hidden from the picker but still valid so
    // existing filters/broadcasts keep resolving.
    hidden: true,
  },
  {
    field: contactFilterFields.enum.consecutiveAiFailures,
    schemaKind: "number",
    optionSource: "none",
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
  {
    field: contactFilterFields.enum.fromCtwaAd,
    schemaKind: "boolean",
    optionSource: "none",
  },
  {
    field: contactFilterFields.enum.ctwaConversion,
    schemaKind: "multiSelect",
    optionSource: "ctwaConversionTypes",
  },
] as const satisfies readonly ContactFilterFieldDefinition[]

export const contactFilterConditionSchemas =
  CONTACT_FILTER_FIELD_DEFINITIONS.map((def) => conditionSchemaForDef(def))
