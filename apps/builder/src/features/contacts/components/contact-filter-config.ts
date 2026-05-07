import {
  type ContactFilterField,
  type CustomFieldType,
  type FormFieldType,
  formFieldTypes,
  type OperatorType,
  operatorTypes,
} from "@chatbotx.io/database/partials"
import type { SelectOption } from "@chatbotx.io/ui/components/form/select-field"
import {
  allContinentOptions,
  allCountryOptions,
} from "@/features/workspaces/schema/types"
import {
  CONTACT_FILTER_FIELD_DEFINITIONS,
  type ContactFilterOptionSource,
  type ContactFilterSchemaKind,
} from "../schemas/contact-filter"

export type ConditionOption = {
  value: OperatorType
  label: string
}

export type FieldConfig = {
  name: ContactFilterField
  formField: FormFieldType
  options?: SelectOption[]
}

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
  type?: CustomFieldType,
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
  { label: t("fields.webchat.label"), value: "webchat" },
  { label: t("fields.whatsapp.label"), value: "whatsapp" },
  { label: t("fields.messenger.label"), value: "messenger" },
  { label: t("fields.zalo.label"), value: "zalo" },
  { label: t("fields.telegram.label"), value: "telegram" },
]

const resolveContactFilterOptions = (
  optionSource: ContactFilterOptionSource,
  ctx: {
    t: (key: string) => string
    channelOptions: SelectOption[]
    channelOptionsNoTelegram: SelectOption[]
    tagOptions: SelectOption[]
    customFieldOptions: SelectOption[]
    flowVersionOptions: SelectOption[]
  },
): SelectOption[] | undefined => {
  switch (optionSource) {
    case "none":
      return
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
    case "channels":
      return ctx.channelOptions
    case "channelsNoTelegram":
      return ctx.channelOptionsNoTelegram
    case "tags":
      return ctx.tagOptions
    case "customFields":
      return ctx.customFieldOptions
    case "flows":
      return ctx.flowVersionOptions
    default: {
      const _exhaustive: never = optionSource
      return _exhaustive
    }
  }
}

export const getFieldConfigs = ({
  t,
  tagOptions,
  customFieldOptions,
  flowVersionOptions,
}: {
  t: (key: string) => string
  tagOptions: SelectOption[]
  customFieldOptions: SelectOption[]
  flowVersionOptions: SelectOption[]
}): FieldConfig[] => {
  const channelOptions = getChannelMultiSelectOptions(t)
  const channelOptionsNoTelegram = channelOptions.filter(
    (opt) => opt.value !== "telegram",
  )

  return CONTACT_FILTER_FIELD_DEFINITIONS.map((def) => ({
    name: def.field,
    formField: schemaKindToFormField(def.schemaKind),
    options: resolveContactFilterOptions(def.optionSource, {
      t,
      channelOptions,
      channelOptionsNoTelegram,
      tagOptions,
      customFieldOptions,
      flowVersionOptions,
    }),
  }))
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
