import z from "zod"

/**
 * What a contact did. Message phases are lifecycle steps shared by every
 * channel and reference type, so a new channel or message kind reuses them.
 */
export const contactActivityTypes = z.enum([
  "flowExecuted",
  "flowNodeExecuted",
  "automatedResponseMatched",
  "formCompleted",
  "messageSent",
  "messageDelivered",
  "messageOpened",
  "messageClicked",
  "adClicked",
])
export type ContactActivityType = z.infer<typeof contactActivityTypes>

/** The kind of entity an activity points at (`ContactActivity.referenceId`). */
export const contactActivityReferenceTypes = z.enum([
  "flow",
  "flowNode",
  "automatedResponse",
  "whatsappFlow",
  "emailTopic",
  "ad",
])
export type ContactActivityReferenceType = z.infer<
  typeof contactActivityReferenceTypes
>

/** `parentReferenceId` of every activity that is not scoped to a parent. */
export const UNSCOPED_PARENT_REFERENCE_ID = "0"
/** `referenceId` of an activity without a reference (e.g. email "No Topic"). */
export const NO_REFERENCE_ID = "-1"

export const contactActivityValueFormats = z.enum(["id", "flowId:nodeId"])
export type ContactActivityValueFormat = z.infer<
  typeof contactActivityValueFormats
>

/**
 * When activity recording went live. There is no backfill, so every
 * activity-backed filter means "since tracking began" and discovery reports
 * this to callers. Set to the release date of the activity store.
 */
export const CONTACT_ACTIVITY_TRACKING_STARTED_AT = "2026-10-23T00:00:00.000Z"

/**
 * Fields whose recording went live after the activity store did. Set each to
 * the moment its writer ships; a field not listed starts at
 * {@link CONTACT_ACTIVITY_TRACKING_STARTED_AT}.
 */
const FIELD_TRACKING_STARTED_AT: Partial<
  Record<ContactActivityTrackedField, string>
> = {
  clickedAd: "2026-10-26T00:00:00.000Z",
}

export const getContactActivityTrackingStartedAt = (field: string): string =>
  (Object.hasOwn(FIELD_TRACKING_STARTED_AT, field)
    ? FIELD_TRACKING_STARTED_AT[field as ContactActivityTrackedField]
    : undefined) ?? CONTACT_ACTIVITY_TRACKING_STARTED_AT

export type ContactActivityFilterConfig = {
  activityType: ContactActivityType
  referenceType: ContactActivityReferenceType
  /** Whether `parentReferenceId` carries a parent id (a flow node's flow). */
  parentScoped: boolean
  /** Public values that stand for "no reference" (mapped to `NO_REFERENCE_ID`). */
  fixedValues: readonly string[]
  valueFormat: ContactActivityValueFormat
  /** Public operation that supplies selectable values. */
  valueSourceOperation: string
  /** API token scope that operation requires. */
  valueSourceScope: string
}

/**
 * Email recipient phases after the send, as carried by the tracking repair job.
 * "sent" is recorded when the recipient is created, so it is not a transition.
 */
export const emailTrackingPhases = z.enum(["delivered", "opened", "clicked"])
export type EmailTrackingPhase = z.infer<typeof emailTrackingPhases>

/** Public value for an email sent without a topic. */
export const NO_TOPIC_FIXED_VALUE = "noTopic"

/**
 * Single source for the activity-backed contact filters: storage, writers,
 * the SQL builder and discovery are all generated from this map. A new
 * channel, form type or reference adds one enum value plus one row here.
 */
export const CONTACT_ACTIVITY_FILTERS = {
  executedFlow: {
    activityType: "flowExecuted",
    referenceType: "flow",
    parentScoped: false,
    fixedValues: [],
    valueFormat: "id",
    valueSourceOperation: "flows.list",
    valueSourceScope: "automation",
  },
  executedStep: {
    activityType: "flowNodeExecuted",
    referenceType: "flowNode",
    parentScoped: true,
    fixedValues: [],
    valueFormat: "flowId:nodeId",
    valueSourceOperation: "flows.listNodes",
    valueSourceScope: "automation",
  },
  keywordsReceived: {
    activityType: "automatedResponseMatched",
    referenceType: "automatedResponse",
    parentScoped: false,
    fixedValues: [],
    valueFormat: "id",
    valueSourceOperation: "keywords.list",
    valueSourceScope: "automation",
  },
  completedWhatsAppFlows: {
    activityType: "formCompleted",
    referenceType: "whatsappFlow",
    parentScoped: false,
    fixedValues: [],
    valueFormat: "id",
    valueSourceOperation: "whatsappFlows.list",
    valueSourceScope: "broadcasts",
  },
  emailSent: {
    activityType: "messageSent",
    referenceType: "emailTopic",
    parentScoped: false,
    fixedValues: [NO_TOPIC_FIXED_VALUE],
    valueFormat: "id",
    valueSourceOperation: "emailTopics.list",
    valueSourceScope: "broadcasts",
  },
  emailDelivered: {
    activityType: "messageDelivered",
    referenceType: "emailTopic",
    parentScoped: false,
    fixedValues: [NO_TOPIC_FIXED_VALUE],
    valueFormat: "id",
    valueSourceOperation: "emailTopics.list",
    valueSourceScope: "broadcasts",
  },
  emailOpened: {
    activityType: "messageOpened",
    referenceType: "emailTopic",
    parentScoped: false,
    fixedValues: [NO_TOPIC_FIXED_VALUE],
    valueFormat: "id",
    valueSourceOperation: "emailTopics.list",
    valueSourceScope: "broadcasts",
  },
  emailClicked: {
    activityType: "messageClicked",
    referenceType: "emailTopic",
    parentScoped: false,
    fixedValues: [NO_TOPIC_FIXED_VALUE],
    valueFormat: "id",
    valueSourceOperation: "emailTopics.list",
    valueSourceScope: "broadcasts",
  },
  clickedAd: {
    activityType: "adClicked",
    referenceType: "ad",
    parentScoped: false,
    fixedValues: [],
    valueFormat: "id",
    valueSourceOperation: "ads.listReferralAds",
    valueSourceScope: "ads",
  },
} as const satisfies Record<string, ContactActivityFilterConfig>

export type ContactActivityFilterField = keyof typeof CONTACT_ACTIVITY_FILTERS

/**
 * Activity filter value sources whose entity has no cheap full list, so the
 * picker searches them on the server (keyword rules, WhatsApp Flows, email
 * topics, ads).
 */
export const contactActivityValueSources = [
  "keywords",
  "whatsappFlows",
  "emailTopics",
  "ads",
] as const
export type ContactActivityValueSource =
  (typeof contactActivityValueSources)[number]

export const isContactActivityValueSource = (
  value: unknown,
): value is ContactActivityValueSource =>
  contactActivityValueSources.some((source) => source === value)

/** Max values one activity condition may carry (bounds the generated SQL). */
export const CONTACT_ACTIVITY_MAX_FILTER_VALUES = 500

export const POSITIVE_BIGINT_PATTERN = /^[1-9]\d*$/
export const MAX_SIGNED_BIGINT = 9_223_372_036_854_775_807n

/** Whether `raw` is a positive id that fits a signed bigint. */
export const isPositiveBigint = (raw: string): boolean =>
  POSITIVE_BIGINT_PATTERN.test(raw) && BigInt(raw) <= MAX_SIGNED_BIGINT

export type ContactActivityReference = {
  parentReferenceId: string
  referenceId: string
}

/** One parser per value format; adding a format is one entry here. */
const REFERENCE_PARSERS: Record<
  ContactActivityValueFormat,
  (raw: string) => ContactActivityReference | undefined
> = {
  id: (raw) =>
    isPositiveBigint(raw)
      ? { parentReferenceId: UNSCOPED_PARENT_REFERENCE_ID, referenceId: raw }
      : undefined,
  "flowId:nodeId": (raw) => {
    const parts = raw.split(":")
    const [parentReferenceId, referenceId] = parts
    return parts.length === 2 &&
      parentReferenceId &&
      referenceId &&
      isPositiveBigint(parentReferenceId) &&
      isPositiveBigint(referenceId)
      ? { parentReferenceId, referenceId }
      : undefined
  },
}

/**
 * The single validator for an activity condition's value, used by the Zod
 * schema (reject with a 4xx) and the SQL builder (fail closed): a bare string
 * or a list of 1..500 unique public values, each either one of the field's
 * fixed values (mapped to the no-reference sentinel) or an id in the field's
 * format. Returns undefined when any value is unusable.
 */
export const parseContactActivityReferences = (
  config: ContactActivityFilterConfig,
  value: unknown,
): ContactActivityReference[] | undefined => {
  const raws = Array.isArray(value) ? value : [value]
  if (
    raws.length === 0 ||
    raws.length > CONTACT_ACTIVITY_MAX_FILTER_VALUES ||
    !raws.every((raw): raw is string => typeof raw === "string")
  ) {
    return
  }

  const parsed = new Map<string, ContactActivityReference>()
  for (const raw of new Set(raws)) {
    const reference = config.fixedValues.includes(raw)
      ? {
          parentReferenceId: UNSCOPED_PARENT_REFERENCE_ID,
          referenceId: NO_REFERENCE_ID,
        }
      : REFERENCE_PARSERS[config.valueFormat](raw)
    if (!reference) {
      return
    }
    parsed.set(
      `${reference.parentReferenceId}:${reference.referenceId}`,
      reference,
    )
  }
  return Array.from(parsed.values())
}

/**
 * Fields whose data starts at {@link CONTACT_ACTIVITY_TRACKING_STARTED_AT}: the
 * registry's reference fields plus the two backed by their own tables.
 */
export const CONTACT_ACTIVITY_TRACKED_FIELDS = [
  ...(Object.keys(CONTACT_ACTIVITY_FILTERS) as ContactActivityFilterField[]),
  "sentMessage",
  "lastDelivered",
] as const

export type ContactActivityTrackedField =
  (typeof CONTACT_ACTIVITY_TRACKED_FIELDS)[number]

export const isContactActivityFilterField = (
  field: string,
): field is ContactActivityFilterField =>
  Object.hasOwn(CONTACT_ACTIVITY_FILTERS, field)

/**
 * Allowed `(activityType, referenceType, parentScoped)` combinations, derived
 * from the filter registry. The migration `CHECK` constraint lists the same
 * pairs; a unit test pins the parity so a new pair cannot skip the migration.
 */
export const CONTACT_ACTIVITY_ALLOWED_PAIRS = Array.from(
  new Map(
    Object.values(CONTACT_ACTIVITY_FILTERS).map((config) => [
      `${config.activityType}:${config.referenceType}`,
      {
        activityType: config.activityType,
        referenceType: config.referenceType,
        parentScoped: config.parentScoped,
      },
    ]),
  ).values(),
)

export type ContactActivityPair =
  (typeof CONTACT_ACTIVITY_ALLOWED_PAIRS)[number]

export const isAllowedContactActivity = (input: {
  activityType: ContactActivityType
  parentReferenceId: string
  referenceType: ContactActivityReferenceType
}): boolean =>
  CONTACT_ACTIVITY_ALLOWED_PAIRS.some(
    (pair) =>
      pair.activityType === input.activityType &&
      pair.referenceType === input.referenceType &&
      pair.parentScoped ===
        (input.parentReferenceId !== UNSCOPED_PARENT_REFERENCE_ID),
  )
