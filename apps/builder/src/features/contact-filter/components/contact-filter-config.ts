import {
  contactLanguageOptions,
  contactLocaleOptions,
  contactTimezoneOptions,
} from "@chatbotx.io/business/contact-locale"
import {
  type ContactFilterField,
  type ContactInfoFilterValue,
  type ContactInfoType,
  contactInfoFilterValues,
  contactInfoTypes,
  contactSources,
  type FormFieldType,
  formFieldTypes,
  lastUserInputTypes,
  type OperatorType,
  operatorTypes,
} from "@chatbotx.io/database/partials"
import type { SelectOption } from "@chatbotx.io/ui/components/form/select-field"
import { languageOptions } from "@/features/integration-whatsapp/message-templates/type"
import {
  allContinentOptions,
  allCountryOptions,
} from "@/features/workspaces/schema/types"
import {
  CONTACT_FILTER_FIELD_DEFINITIONS,
  type ContactFilterFieldDefinition,
  type ContactFilterOptionSource,
  type ContactFilterSchemaKind,
  type CtwaRetargetCondition,
  type CtwaRetargetSegment,
} from "../schemas"

export type ConditionOption = {
  value: OperatorType
  label: string
  disabled?: boolean
}

export type FieldConfig = {
  /** `ContactFilterField` for static fields, `customField:<id>` for custom fields, `couponTopic:<id>` for coupon topics. */
  name: string
  /** Set for dynamic custom-field configs; identifies the workspace custom field. */
  customFieldId?: string
  /** Raw custom field type from the workspace, used for custom-field operator rules. */
  customFieldType?: string
  /** Set for dynamic coupon-topic configs; identifies the workspace coupon topic. */
  topicId?: string
  /** Display label override (custom field / coupon topic name); static fields fall back to i18n. */
  label?: string
  formField: FormFieldType
  group: ContactFilterFieldGroup
  options?: SelectOption[]
  /** Retired field: still rendered/validated, but omitted from the picker. */
  hidden?: boolean
}

/** Minimal workspace custom field shape needed to build a per-field filter config. */
export type CustomFieldFilterOption = {
  id: string
  name: string
  type?: string
}

export type ContactFilterFieldGroup =
  | "contactInfo"
  | "opportunity"
  | "instagram"
  | "analytics"
  | "facebookInstagramComment"
  | "sms"
  | "broadcastWhatsapp"
  | "email"
  | "systemTime"
  | "ecommerce"
  | "systemFields"
  | "topicCoupon"
  | "customFields"
  | "ctwaAds"

type GroupedContactFilterFieldGroup = Exclude<
  ContactFilterFieldGroup,
  "contactInfo"
>

/**
 * Transient shape used by the “add condition” dialog before
 * `singleContactFilterConditionSchema` parsing.
 */
export type ContactFilterConditionFormDraft = {
  field: string
  operator: string
  value: string | string[]
}

export const convertCustomFieldTypeToConditionType = (
  type?: string,
): FormFieldType => {
  switch (type) {
    case "number":
      return formFieldTypes.enum.number
    case "date":
    case "datetime":
      return formFieldTypes.enum.datetime
    case "boolean":
      return formFieldTypes.enum.boolean
    default:
      return formFieldTypes.enum.text
  }
}

const schemaKindToFormField = (
  kind: ContactFilterSchemaKind,
): FormFieldType => {
  switch (kind) {
    case "boolean":
      return formFieldTypes.enum.boolean
    case "text":
      return formFieldTypes.enum.text
    case "multiSelect":
      return formFieldTypes.enum.multiSelect
    case "select":
      return formFieldTypes.enum.select
    case "datetime":
      return formFieldTypes.enum.datetime
    case "number":
      return formFieldTypes.enum.number
    default: {
      const _exhaustive: never = kind
      return _exhaustive
    }
  }
}

const getChannelMultiSelectOptions = (
  t: (key: string) => string,
): SelectOption[] => [
  { label: t("fields.omnichannel.label"), value: "omnichannel" },
  { label: t("fields.webchat.label"), value: "webchat" },
  { label: t("fields.messenger.label"), value: "messenger" },
  { label: t("fields.whatsapp.label"), value: "whatsapp" },
  { label: t("fields.zalo.label"), value: "zalo" },
  { label: t("fields.smtp.label"), value: "smtp" },
  { label: t("fields.telegram.label"), value: "telegram" },
  { label: t("fields.instagram.label"), value: "instagram" },
  { label: t("fields.tiktok.label"), value: "tiktok" },
]

const getContactSourceOptions = (t: (key: string) => string): SelectOption[] =>
  contactSources.options.map((source) => ({
    label: t(`condition.sources.${source}`),
    value: source,
  }))

const CONTACT_INFO_TYPE_LABEL_KEYS = {
  phone: "fields.phone.label",
  email: "fields.email.label",
} as const satisfies Record<ContactInfoType, string>

/** Atomic phone/email options for the `contactInfoUpdated` trigger source. */
export const getContactInfoTypeOptions = (
  t: (key: string) => string,
): SelectOption[] =>
  contactInfoTypes.options.map((infoType) => ({
    label: t(CONTACT_INFO_TYPE_LABEL_KEYS[infoType]),
    value: infoType,
  }))

const CONTACT_INFO_FILTER_LABEL_KEYS = {
  phone: "fields.phone.label",
  email: "fields.email.label",
  phoneAndEmail: "fields.phoneAndEmail.label",
} as const satisfies Record<ContactInfoFilterValue, string>

/** Phone / Email / Phone+Email options for the `hasContactInfo` filter. */
export const getContactInfoFilterOptions = (
  t: (key: string) => string,
): SelectOption[] =>
  contactInfoFilterValues.options.map((value) => ({
    label: t(CONTACT_INFO_FILTER_LABEL_KEYS[value]),
    value,
  }))

const getLocaleOptions = (t: (key: string) => string): SelectOption[] => {
  const localeOptions = [...languageOptions]
  const existingValues = new Set(localeOptions.map((option) => option.value))
  const contactLanguageLabelByLocale = new Map<string, string>(
    contactLanguageOptions.map((option) => [option.locale, t(option.labelKey)]),
  )

  for (const option of contactLocaleOptions) {
    if (existingValues.has(option.value)) {
      continue
    }

    localeOptions.push({
      label: contactLanguageLabelByLocale.get(option.value) ?? option.label,
      value: option.value,
    })
    existingValues.add(option.value)
  }

  return localeOptions
}

const resolveContactFilterOptions = (
  optionSource: ContactFilterOptionSource,
  ctx: {
    t: (key: string) => string
    channelOptions: SelectOption[]
    inboxOptions: SelectOption[]
    tagOptions: SelectOption[]
    flowVersionOptions: SelectOption[]
    broadcastOptions: SelectOption[]
    sequenceOptions: SelectOption[]
    reflinkOptions: SelectOption[]
    assigneeOptions: SelectOption[]
  },
): SelectOption[] | undefined => {
  switch (optionSource) {
    case "none":
      return
    case "contactInfoFilterValues":
      return getContactInfoFilterOptions(ctx.t)
    case "languages":
      return getLocaleOptions(ctx.t)
    case "timezones":
      return contactTimezoneOptions
    case "countries":
      return allCountryOptions
    case "continents":
      return allContinentOptions
    case "gender":
      return [
        { label: ctx.t("fields.gender.male"), value: "male" },
        { label: ctx.t("fields.gender.female"), value: "female" },
        { label: ctx.t("fields.gender.unknown"), value: "unknown" },
      ]
    case "lastUserInputTypes":
      return lastUserInputTypes.options.map((type) => ({
        label: ctx.t(`fields.lastUserInputTypes.${type}`),
        value: type,
      }))
    case "contactSources":
      return getContactSourceOptions(ctx.t)
    case "channels":
      return ctx.channelOptions
    case "inboxes":
      return ctx.inboxOptions
    case "tags":
      return ctx.tagOptions
    case "flows":
      return ctx.flowVersionOptions
    case "broadcasts":
      return ctx.broadcastOptions
    case "sequences":
      return ctx.sequenceOptions
    case "reflinks":
      return ctx.reflinkOptions
    case "assignees":
      return ctx.assigneeOptions
    case "ctwaConversionTypes":
      return [
        {
          label: ctx.t("condition.fields.ctwaConversionTypes.lead"),
          value: "lead",
        },
        {
          label: ctx.t("condition.fields.ctwaConversionTypes.purchase"),
          value: "purchase",
        },
      ]
    default: {
      const _exhaustive: never = optionSource
      return _exhaustive
    }
  }
}

const CONTACT_FILTER_GROUP_FIELDS = {
  opportunity: [
    "hasOpportunity",
    "hasOpenOpportunity",
    "hasWonOpportunity",
    "hasLostOpportunity",
  ],
  instagram: [
    "instagramStoryReply",
    "followsBusinessOnInstagram",
    "businessFollowsUserOnInstagram",
    "verifiedAccountOnInstagram",
    "followerCountOnInstagram",
  ],
  analytics: [
    "tags",
    "lastSent",
    "lastDelivered",
    "lastSeen",
    "lastSeenMinutesAgo",
    "lastInteraction",
    "lastInteractionMinutesAgo",
    "unreplied",
    "unread",
    "appliedJobs",
    "completedWhatsAppFlows",
    "messengerList",
    "subscribedToDripCampaign",
    "conversationAssigned",
    "entryPointsLinks",
    "sentMessage",
    "keywordsReceived",
    "executedFlow",
    "executedStep",
    "consecutiveAiFailures",
    "questionnaireStarted",
    "questionnaireInProgress",
    "questionnaireFinished",
    "votedOnPoll",
  ],
  facebookInstagramComment: [
    "lastComment",
    "commentedOnPost",
    "reactedOnPost",
    "lastTotalTaggedUsers",
    "lastTotalNewTaggedUsers",
  ],
  sms: ["phone", "phoneWasVerified", "optedInForSms"],
  broadcastWhatsapp: [
    "broadcastSent",
    "broadcastDelivered",
    "broadcastSeen",
    "broadcastClicked",
    "broadcastFailed",
  ],
  email: [
    "email",
    "emailWasVerified",
    "optedInForEmail",
    "emailSent",
    "emailDelivered",
    "emailOpened",
    "emailClicked",
  ],
  ctwaAds: ["fromCtwaAd", "ctwaConversion"],
  systemTime: [
    "isWithinWorkingHours",
    "currentDate",
    "currentTime",
    "currentDayOfMonth",
    "currentDayOfWeek",
    "currentMonth",
  ],
  ecommerce: [
    "bought",
    "boughtItems",
    "totalSpent",
    "numberOfOrders",
    "shoppingCartTotal",
    "shoppingCartSubtotal",
    "shoppingCartIsEmpty",
    "shoppingCartContainsItems",
    "lastSentMessageFailed",
  ],
  systemFields: ["lastUserInput", "lastUserInputType"],
  // Populated dynamically — each coupon topic gets its own FieldConfig with
  // group "topicCoupon" set directly (see couponTopicConfigs below).
  topicCoupon: [],
  customFields: ["customFields"],
} as const satisfies Record<
  GroupedContactFilterFieldGroup,
  readonly ContactFilterField[]
>

const CONTACT_FILTER_FIELD_GROUPS = Object.keys(
  CONTACT_FILTER_GROUP_FIELDS,
) as GroupedContactFilterFieldGroup[]

const CONTACT_FILTER_GROUP_BY_FIELD = new Map<
  ContactFilterField,
  ContactFilterFieldGroup
>(
  CONTACT_FILTER_FIELD_GROUPS.flatMap((group) =>
    CONTACT_FILTER_GROUP_FIELDS[group].map((field) => [field, group] as const),
  ),
)

const getContactFilterFieldGroup = (
  field: ContactFilterField,
): ContactFilterFieldGroup =>
  CONTACT_FILTER_GROUP_BY_FIELD.get(field) ?? "contactInfo"

export const getFieldConfigs = ({
  t,
  tagOptions,
  inboxOptions,
  customFields,
  flowVersionOptions,
  broadcastOptions = [],
  sequenceOptions = [],
  reflinkOptions = [],
  assigneeOptions = [],
  couponTopicOptions = [],
}: {
  t: (key: string) => string
  tagOptions: SelectOption[]
  inboxOptions: SelectOption[]
  customFields: CustomFieldFilterOption[]
  flowVersionOptions: SelectOption[]
  broadcastOptions?: SelectOption[]
  sequenceOptions?: SelectOption[]
  reflinkOptions?: SelectOption[]
  assigneeOptions?: SelectOption[]
  couponTopicOptions?: SelectOption[]
}): FieldConfig[] => {
  const channelOptions = getChannelMultiSelectOptions(t)

  const staticConfigs: FieldConfig[] = CONTACT_FILTER_FIELD_DEFINITIONS.map(
    (def: ContactFilterFieldDefinition) => ({
      name: def.field,
      formField: schemaKindToFormField(def.schemaKind),
      group: getContactFilterFieldGroup(def.field),
      hidden: def.hidden,
      options: resolveContactFilterOptions(def.optionSource, {
        t,
        channelOptions,
        inboxOptions,
        tagOptions,
        flowVersionOptions,
        broadcastOptions,
        sequenceOptions,
        reflinkOptions,
        assigneeOptions,
      }),
    }),
  )

  // Each workspace custom field becomes its own filter field, value-typed by the
  // custom field's type. Encoded as `customField:<id>` so the form/row can map
  // back to a `{ field: "customField", customFieldId }` condition.
  const customFieldConfigs: FieldConfig[] = customFields.map((field) => ({
    name: `customField:${field.id}`,
    customFieldId: field.id,
    customFieldType: field.type,
    label: field.name,
    formField: convertCustomFieldTypeToConditionType(field.type),
    group: "customFields",
  }))

  // Each workspace coupon topic becomes its own filter field (replaces the
  // old static "Coupon issued"/"Coupon usage" pair). Encoded as
  // `couponTopic:<id>` so the form/row can map back to a
  // `{ field: "couponTopic", topicId }` condition.
  const couponTopicConfigs: FieldConfig[] = couponTopicOptions.map((topic) => ({
    name: `couponTopic:${topic.value}`,
    topicId: topic.value,
    label: topic.label,
    formField: formFieldTypes.enum.text,
    group: "topicCoupon",
  }))

  return [...staticConfigs, ...customFieldConfigs, ...couponTopicConfigs]
}

export const getFieldOptions = (
  configs: FieldConfig[],
  t: (key: string) => string,
): SelectOption[] => {
  const toOption = (config: FieldConfig): SelectOption => ({
    label: config.label ?? t(`condition.fields.${config.name}`),
    value: config.name,
  })

  // Retired fields stay valid + rendered for existing conditions but are never
  // offered for new ones.
  const pickableConfigs = configs.filter((config) => !config.hidden)

  const contactInfoOptions = pickableConfigs
    .filter((config) => config.group === "contactInfo")
    .map(toOption)

  const groupOptions = (group: GroupedContactFilterFieldGroup) => {
    const children = pickableConfigs
      .filter((config) => config.group === group)
      .map(toOption)

    return children.length > 0
      ? [
          {
            label: t(`condition.fieldGroups.${group}`),
            value: `group-${group}`,
            children,
          },
        ]
      : []
  }

  return [
    ...contactInfoOptions,
    ...CONTACT_FILTER_FIELD_GROUPS.flatMap(groupOptions),
  ]
}

export const getConditionOptions = (
  t: (key: string) => string,
): ConditionOption[] => [
  { value: operatorTypes.enum.eq, label: t("fields.operator.is") },
  { value: operatorTypes.enum.ne, label: t("fields.operator.isNot") },
  { value: operatorTypes.enum.in, label: t("fields.operator.in") },
  { value: operatorTypes.enum.notIn, label: t("fields.operator.notIn") },
  { value: operatorTypes.enum.isEmpty, label: t("fields.operator.isEmpty") },
  {
    value: operatorTypes.enum.isNotEmpty,
    label: t("fields.operator.isNotEmpty"),
  },
  { value: operatorTypes.enum.gt, label: t("fields.operator.gt") },
  { value: operatorTypes.enum.lt, label: t("fields.operator.lt") },
  { value: operatorTypes.enum.gte, label: t("fields.operator.gte") },
  { value: operatorTypes.enum.lte, label: t("fields.operator.lte") },
  { value: operatorTypes.enum.contains, label: t("fields.operator.contains") },
  {
    value: operatorTypes.enum.notContains,
    label: t("fields.operator.notContains"),
  },
  {
    value: operatorTypes.enum.startsWith,
    label: t("fields.operator.startsWith"),
  },
  {
    value: operatorTypes.enum.endsWith,
    label: t("fields.operator.endsWith"),
  },
  {
    value: operatorTypes.enum.isBetween,
    label: t("fields.operator.isBetween"),
  },
  {
    value: operatorTypes.enum.notBetween,
    label: t("fields.operator.notBetween"),
  },
  { value: operatorTypes.enum.used, label: t("fields.operator.used") },
]

const CTWA_RETARGET_SEGMENT_LABEL_KEYS = {
  conversations: "condition.ctwaRetarget.segments.conversations",
  leads: "condition.ctwaRetarget.segments.leads",
  purchases: "condition.ctwaRetarget.segments.purchases",
} as const satisfies Record<CtwaRetargetSegment, string>

/**
 * Read-only chip label for the machine-generated `ctwaRetarget` condition
 * (no operator/value to render — see `contact-filter-condition-row.tsx` /
 * `contact-filter-summary.tsx`). Composed from individually translated parts
 * rather than one ICU-templated string, mirroring
 * `ads-analytics-view.tsx`'s `suggestedName`.
 */
export const formatCtwaRetargetChipLabel = (
  condition: Pick<
    CtwaRetargetCondition,
    "segment" | "adId" | "since" | "until"
  >,
  t: (key: string) => string,
): string => {
  const segmentLabel = t(CTWA_RETARGET_SEGMENT_LABEL_KEYS[condition.segment])
  const adPart = condition.adId
    ? `${t("condition.ctwaRetarget.adPrefix")} ${condition.adId}`
    : t("condition.ctwaRetarget.allAds")

  return [segmentLabel, adPart, `${condition.since}–${condition.until}`].join(
    " · ",
  )
}

export const formatConditionValueDisplay = (
  value: string | string[] | undefined,
  options?: SelectOption[],
): string => {
  if (value === undefined) {
    return ""
  }
  if (!options?.length) {
    return Array.isArray(value) ? value.join(", ") : value
  }

  const getLabel = (val: string) =>
    options.find((opt) => opt.value === val)?.label ?? val

  if (Array.isArray(value)) {
    return value.map(getLabel).join(", ")
  }

  return getLabel(value as string)
}
