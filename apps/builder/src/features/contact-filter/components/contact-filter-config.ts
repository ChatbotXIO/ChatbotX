import {
  type ContactFilterField,
  contactSources,
  type FormFieldType,
  formFieldTypes,
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
  type ContactFilterOptionSource,
  type ContactFilterSchemaKind,
} from "../schemas"

export type ConditionOption = {
  value: OperatorType
  label: string
  disabled?: boolean
}

export type FieldConfig = {
  /** `ContactFilterField` for static fields, `customField:<id>` for custom fields. */
  name: string
  /** Set for dynamic custom-field configs; identifies the workspace custom field. */
  customFieldId?: string
  /** Raw custom field type from the workspace, used for custom-field operator rules. */
  customFieldType?: string
  /** Display label override (custom field name); static fields fall back to i18n. */
  label?: string
  formField: FormFieldType
  group: ContactFilterFieldGroup
  options?: SelectOption[]
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
  | "customFields"

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

const resolveContactFilterOptions = (
  optionSource: ContactFilterOptionSource,
  ctx: {
    t: (key: string) => string
    channelOptions: SelectOption[]
    inboxOptions: SelectOption[]
    tagOptions: SelectOption[]
    flowVersionOptions: SelectOption[]
  },
): SelectOption[] | undefined => {
  switch (optionSource) {
    case "none":
      return
    case "languages":
      return languageOptions
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
}: {
  t: (key: string) => string
  tagOptions: SelectOption[]
  inboxOptions: SelectOption[]
  customFields: CustomFieldFilterOption[]
  flowVersionOptions: SelectOption[]
}): FieldConfig[] => {
  const channelOptions = getChannelMultiSelectOptions(t)

  const staticConfigs: FieldConfig[] = CONTACT_FILTER_FIELD_DEFINITIONS.map(
    (def) => ({
      name: def.field,
      formField: schemaKindToFormField(def.schemaKind),
      group: getContactFilterFieldGroup(def.field),
      options: resolveContactFilterOptions(def.optionSource, {
        t,
        channelOptions,
        inboxOptions,
        tagOptions,
        flowVersionOptions,
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

  return [...staticConfigs, ...customFieldConfigs]
}

export const getFieldOptions = (
  configs: FieldConfig[],
  t: (key: string) => string,
): SelectOption[] => {
  const toOption = (config: FieldConfig): SelectOption => ({
    label: config.label ?? t(`condition.fields.${config.name}`),
    value: config.name,
  })

  const contactInfoOptions = configs
    .filter((config) => config.group === "contactInfo")
    .map(toOption)

  const groupOptions = (group: GroupedContactFilterFieldGroup) => {
    const children = configs
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
]

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
