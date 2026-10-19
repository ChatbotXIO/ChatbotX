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
  | "channelPosts"
  | "workingHours"

/**
 * Where a contact-filter field may be used. `contacts` is every list/audience
 * surface (contacts, conversations, broadcast audience and their public APIs);
 * `flowCondition` is the flow Condition step, which evaluates the filter at
 * runtime. A field limited to `flowCondition` is rejected by the schemas of
 * every other surface, not just hidden from their pickers.
 */
export const CONTACT_FILTER_SURFACES = ["contacts", "flowCondition"] as const
export type ContactFilterSurface = (typeof CONTACT_FILTER_SURFACES)[number]

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
  /** Surfaces that accept this field. Omitted = every surface. */
  surfaces?: readonly ContactFilterSurface[]
}

export const isFieldOnSurface = (
  def: ContactFilterFieldDefinition,
  surface: ContactFilterSurface,
): boolean => !def.surfaces || def.surfaces.includes(surface)

const conditionSchemaForDef = (def: ContactFilterFieldDefinition) =>
  staticFieldFilter(def.field)

/**
 * One row per supported filter field: drives Zod `contactFilter` conditions and UI `FieldConfig`.
 * Array order IS the "add condition" picker order: ungrouped contact-info
 * fields render first, then each group lists its fields in this order
 * (`getFieldOptions`). Keep related fields adjacent so the list scans quickly.
 */
export const CONTACT_FILTER_FIELD_DEFINITIONS = [
  // --- Contact info (ungrouped, rendered first in the picker) ---
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
    field: contactFilterFields.enum.contactCreatedDateMinutesAgo,
    schemaKind: "number",
    optionSource: "none",
  },
  {
    field: contactFilterFields.enum.source,
    schemaKind: "multiSelect",
    optionSource: "contactSources",
  },
  {
    field: contactFilterFields.enum.interactedInLast24h,
    schemaKind: "boolean",
    optionSource: "none",
  },
  {
    field: contactFilterFields.enum.conversationTransferredToHuman,
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
    field: contactFilterFields.enum.existingContact,
    schemaKind: "boolean",
    optionSource: "none",
    // Superseded by `hasContactInfo`; hidden from the picker but still valid so
    // existing filters/broadcasts keep resolving.
    hidden: true,
  },
  {
    field: contactFilterFields.enum.hasContactInfo,
    schemaKind: "multiSelect",
    optionSource: "contactInfoFilterValues",
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
  // --- Instagram ---
  {
    field: contactFilterFields.enum.followsBusinessOnInstagram,
    schemaKind: "boolean",
    optionSource: "none",
  },
  {
    field: contactFilterFields.enum.businessFollowsUserOnInstagram,
    schemaKind: "boolean",
    optionSource: "none",
  },
  {
    field: contactFilterFields.enum.verifiedAccountOnInstagram,
    schemaKind: "boolean",
    optionSource: "none",
  },
  {
    field: contactFilterFields.enum.followerCountOnInstagram,
    schemaKind: "number",
    optionSource: "none",
  },
  // --- Analytics ---
  {
    field: contactFilterFields.enum.lastSent,
    schemaKind: "datetime",
    optionSource: "none",
  },
  {
    field: contactFilterFields.enum.lastSeen,
    schemaKind: "datetime",
    optionSource: "none",
  },
  {
    field: contactFilterFields.enum.lastSeenMinutesAgo,
    schemaKind: "number",
    optionSource: "none",
  },
  {
    field: contactFilterFields.enum.lastInteraction,
    schemaKind: "datetime",
    optionSource: "none",
  },
  {
    field: contactFilterFields.enum.lastInteractionMinutesAgo,
    schemaKind: "number",
    optionSource: "none",
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
    field: contactFilterFields.enum.tags,
    schemaKind: "multiSelect",
    optionSource: "tags",
  },
  {
    field: contactFilterFields.enum.subscribedToDripCampaign,
    schemaKind: "multiSelect",
    optionSource: "sequences",
  },
  {
    field: contactFilterFields.enum.conversationAssigned,
    schemaKind: "multiSelect",
    optionSource: "assignees",
  },
  {
    field: contactFilterFields.enum.entryPointsLinks,
    schemaKind: "multiSelect",
    optionSource: "reflinks",
  },
  {
    field: contactFilterFields.enum.consecutiveAiFailures,
    schemaKind: "number",
    optionSource: "none",
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
  // --- Facebook/Instagram comment ---
  {
    field: contactFilterFields.enum.lastComment,
    schemaKind: "text",
    optionSource: "none",
  },
  {
    field: contactFilterFields.enum.commentedOnPost,
    schemaKind: "multiSelect",
    optionSource: "channelPosts",
  },
  // --- SMS ---
  {
    field: contactFilterFields.enum.phone,
    schemaKind: "text",
    optionSource: "none",
  },
  // --- Broadcast (WhatsApp) ---
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
  // --- Email ---
  {
    field: contactFilterFields.enum.email,
    schemaKind: "text",
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
  // --- Ads (CTWA / Google) ---
  {
    field: contactFilterFields.enum.fromCtwaAd,
    schemaKind: "boolean",
    optionSource: "none",
  },
  {
    field: contactFilterFields.enum.fromGoogleAd,
    schemaKind: "boolean",
    optionSource: "none",
  },
  {
    field: contactFilterFields.enum.ctwaConversion,
    schemaKind: "multiSelect",
    optionSource: "ctwaConversionTypes",
  },
  // --- System fields ---
  {
    field: contactFilterFields.enum.isWithinWorkingHours,
    schemaKind: "multiSelect",
    optionSource: "workingHours",
    // Evaluated against `now()`, so it only means something at runtime.
    surfaces: ["flowCondition"],
  },
  {
    field: contactFilterFields.enum.lastUserInput,
    schemaKind: "text",
    optionSource: "none",
  },
  {
    field: contactFilterFields.enum.lastUserInputType,
    schemaKind: "select",
    optionSource: "lastUserInputTypes",
  },
] as const satisfies readonly ContactFilterFieldDefinition[]

/** Condition schemas accepted on `surface` (field definitions filtered by `surfaces`). */
const conditionSchemasForSurface = (surface: ContactFilterSurface) =>
  CONTACT_FILTER_FIELD_DEFINITIONS.filter((def) =>
    isFieldOnSurface(def, surface),
  ).map((def) => conditionSchemaForDef(def))

export const contactFilterConditionSchemas =
  conditionSchemasForSurface("contacts")

export const flowConditionFilterConditionSchemas =
  conditionSchemasForSurface("flowCondition")
