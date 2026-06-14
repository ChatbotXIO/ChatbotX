import {
  type ContactFilterField,
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

const getContactSourceOptions = (
  t: (key: string) => string,
): SelectOption[] => [
  { label: t("condition.sources.direct"), value: "direct" },
  { label: t("condition.sources.comments"), value: "comments" },
  { label: t("condition.sources.ads"), value: "ads" },
  { label: t("condition.sources.fbLeadAd"), value: "fbLeadAd" },
  { label: t("condition.sources.inboundMessage"), value: "inboundMessage" },
  { label: t("condition.sources.imported"), value: "imported" },
  { label: t("condition.sources.api"), value: "api" },
  { label: t("condition.sources.webchat"), value: "webchat" },
  { label: t("condition.sources.botLink"), value: "botLink" },
  { label: t("condition.sources.chatPlugin"), value: "chatPlugin" },
]

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

const getContactFilterFieldGroup = (
  field: ContactFilterField,
): ContactFilterFieldGroup => {
  switch (field) {
    case "hasOpportunity":
    case "hasOpenOpportunity":
    case "hasWonOpportunity":
    case "hasLostOpportunity":
      return "opportunity"
    case "instagramStoryReply":
    case "followsBusinessOnInstagram":
    case "businessFollowsUserOnInstagram":
    case "verifiedAccountOnInstagram":
    case "followerCountOnInstagram":
      return "instagram"
    case "tags":
    case "lastSent":
    case "lastDelivered":
    case "lastSeen":
    case "lastSeenMinutesAgo":
    case "lastInteraction":
    case "lastInteractionMinutesAgo":
    case "unreplied":
    case "unread":
    case "appliedJobs":
    case "completedWhatsAppFlows":
    case "messengerList":
    case "subscribedToDripCampaign":
    case "conversationAssigned":
    case "entryPointsLinks":
    case "sentMessage":
    case "keywordsReceived":
    case "executedFlow":
    case "executedStep":
    case "consecutiveAiFailures":
    case "questionnaireStarted":
    case "questionnaireInProgress":
    case "questionnaireFinished":
    case "votedOnPoll":
      return "analytics"
    case "lastComment":
    case "commentedOnPost":
    case "reactedOnPost":
    case "lastTotalTaggedUsers":
    case "lastTotalNewTaggedUsers":
      return "facebookInstagramComment"
    case "phone":
    case "phoneWasVerified":
    case "optedInForSms":
      return "sms"
    case "broadcastSent":
    case "broadcastDelivered":
    case "broadcastSeen":
    case "broadcastClicked":
    case "broadcastFailed":
      return "broadcastWhatsapp"
    case "email":
    case "emailWasVerified":
    case "optedInForEmail":
    case "emailSent":
    case "emailDelivered":
    case "emailOpened":
    case "emailClicked":
      return "email"
    case "isWithinWorkingHours":
    case "currentDate":
    case "currentTime":
    case "currentDayOfMonth":
    case "currentDayOfWeek":
    case "currentMonth":
      return "systemTime"
    case "bought":
    case "boughtItems":
    case "totalSpent":
    case "numberOfOrders":
    case "shoppingCartTotal":
    case "shoppingCartSubtotal":
    case "shoppingCartIsEmpty":
    case "shoppingCartContainsItems":
    case "lastSentMessageFailed":
      return "ecommerce"
    case "lastUserInput":
    case "lastUserInputType":
      return "systemFields"
    case "customFields":
      return "customFields"
    default:
      return "contactInfo"
  }
}

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

  const groupOptions = (group: ContactFilterFieldGroup, label: string) => {
    const children = configs
      .filter((config) => config.group === group)
      .map(toOption)

    return children.length > 0
      ? [
          {
            label,
            value: `group-${group}`,
            children,
          },
        ]
      : []
  }

  return [
    ...contactInfoOptions,
    ...groupOptions("opportunity", t("condition.fieldGroups.opportunity")),
    ...groupOptions("instagram", t("condition.fieldGroups.instagram")),
    ...groupOptions("analytics", t("condition.fieldGroups.analytics")),
    ...groupOptions(
      "facebookInstagramComment",
      t("condition.fieldGroups.facebookInstagramComment"),
    ),
    ...groupOptions("sms", t("condition.fieldGroups.sms")),
    ...groupOptions(
      "broadcastWhatsapp",
      t("condition.fieldGroups.broadcastWhatsapp"),
    ),
    ...groupOptions("email", t("condition.fieldGroups.email")),
    ...groupOptions("systemTime", t("condition.fieldGroups.systemTime")),
    ...groupOptions("ecommerce", t("condition.fieldGroups.ecommerce")),
    ...groupOptions("systemFields", t("condition.fieldGroups.systemFields")),
    ...groupOptions("customFields", t("condition.fieldGroups.customFields")),
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
