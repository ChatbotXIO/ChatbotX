"use client"

import {
  type FormFieldType,
  operatorTypes,
} from "@chatbotx.io/database/partials"
import {
  isValidDateTimeFilterValue,
  valueContainsVariablePlaceholder,
} from "@chatbotx.io/database/queries/contact-filter/value-format"
import { ComboboxField } from "@chatbotx.io/ui/components/form/combobox-field"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { MultiSelectField } from "@chatbotx.io/ui/components/form/multi-select-field"
import {
  SelectField,
  type SelectOption,
} from "@chatbotx.io/ui/components/form/select-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { useTranslations } from "next-intl"
import { type ReactNode, useCallback, useMemo } from "react"
import { useForm, useWatch } from "react-hook-form"
import { PlainTextEditorField } from "@/components/tiptap/plain-text-editor-field"
import {
  type ContactFilterCondition,
  singleContactFilterConditionSchema,
} from "../schemas"
import {
  type ConditionOption,
  type ContactFilterConditionFormDraft,
  type FieldConfig,
  getFieldOptions,
} from "./contact-filter-config"
import { CONTACT_FILTER_DIALOG_SIZE_CLASS } from "./contact-filter-dialog-layout"
import {
  getCouponTopicConditionOptions,
  getCouponTopicValueInputConfig,
  getDefaultCouponTopicValue,
} from "./coupon-topic-filter-config"
import {
  type CustomFieldValueInputConfig,
  customFieldOperatorRequiresArrayValue,
  getCustomFieldConditionOptions,
  getCustomFieldValueInputConfig,
  getDefaultCustomFieldValue,
} from "./custom-field-filter-config"
import {
  getDefaultStaticFieldValue,
  getStaticFieldConditionOptions,
  getStaticFieldValueInputConfig,
  staticFieldOperatorRequiresArrayValue,
} from "./static-field-filter-config"
import {
  DATETIME_VALUE_INPUT_KINDS,
  resolveValueInputKind,
  type ValueInputKind,
} from "./value-input-kind"

const OPERATORS_WITHOUT_VALUE: string[] = [
  operatorTypes.enum.isEmpty,
  operatorTypes.enum.isNotEmpty,
  operatorTypes.enum.used,
]

const getFirstEnabledOperator = (
  options: { value: string; disabled?: boolean }[],
) => options.find((option) => !option.disabled)?.value ?? ""

/**
 * Maps a raw form draft to the condition shape validated by
 * `singleContactFilterConditionSchema`. Static fields pass through unchanged;
 * a custom-field config (`customField:<id>`) becomes the dynamic
 * `{ field: "customField", customFieldId, valueType }` branch; a coupon-topic
 * config (`couponTopic:<id>`) becomes `{ field: "couponTopic", topicId }`.
 */
export const buildConditionDraft = (
  values: ContactFilterConditionFormDraft,
  config: FieldConfig | undefined,
) => {
  const operator = values.operator
  const shouldOmitValue = OPERATORS_WITHOUT_VALUE.includes(operator)

  if (config?.customFieldId) {
    const draft = {
      field: "customField" as const,
      customFieldId: config.customFieldId,
      valueType: config.formField,
      customFieldType: config.customFieldType,
      operator,
    }

    return shouldOmitValue ? draft : { ...draft, value: values.value }
  }

  if (config?.topicId) {
    const draft = {
      field: "couponTopic" as const,
      topicId: config.topicId,
      operator,
    }

    return shouldOmitValue ? draft : { ...draft, value: values.value }
  }

  return shouldOmitValue
    ? {
        field: values.field,
        operator,
      }
    : values
}

const resolveDraftFieldName = (condition: ContactFilterCondition): string => {
  if (condition.field === "customField" && "customFieldId" in condition) {
    return `customField:${condition.customFieldId}`
  }
  if (condition.field === "couponTopic" && "topicId" in condition) {
    return `couponTopic:${condition.topicId}`
  }
  return condition.field
}

/**
 * Inverse of buildConditionDraft; used to prefill the edit form. The
 * machine-generated `ctwaRetarget` condition has no `operator` — it's never
 * actually routed here (its row renders a read-only chip with no edit
 * affordance), but the field is typed defensively since `ContactFilterCondition`
 * is a union.
 */
export const buildDraftFromCondition = (
  condition: ContactFilterCondition,
): ContactFilterConditionFormDraft => ({
  field: resolveDraftFieldName(condition),
  operator: "operator" in condition ? condition.operator : "",
  value:
    "value" in condition && condition.value !== undefined
      ? condition.value
      : "",
})

export const getConditionOptionsForConfig = (
  config: FieldConfig | undefined,
  conditionOptions: ConditionOption[],
): ConditionOption[] => {
  if (!config) {
    return []
  }
  if (config.customFieldId) {
    return getCustomFieldConditionOptions(config, conditionOptions)
  }
  if (config.topicId) {
    return getCouponTopicConditionOptions(conditionOptions)
  }
  return getStaticFieldConditionOptions(config, conditionOptions)
}

export const getDefaultConditionValue = (
  config: FieldConfig | undefined,
  operator: string,
): string | string[] => {
  if (config?.customFieldId) {
    return getDefaultCustomFieldValue(config, operator)
  }
  if (config?.topicId) {
    return getDefaultCouponTopicValue(config, operator)
  }
  return getDefaultStaticFieldValue(config, operator)
}

export const getResetDraftForField = (
  config: FieldConfig | undefined,
  conditionOptions: ConditionOption[],
): Pick<ContactFilterConditionFormDraft, "operator" | "value"> => {
  const operator = getFirstEnabledOperator(
    getConditionOptionsForConfig(config, conditionOptions),
  )
  return {
    operator,
    value: getDefaultConditionValue(config, operator),
  }
}

type ContactFilterValueFieldsProps = {
  /** `null` when operator is empty / isEmpty / isNotEmpty or no field selected */
  valueType: FormFieldType | null
  valueOptions: SelectOption[]
  customFieldInput?: CustomFieldValueInputConfig
  enableVariables: boolean
}

type FreeTextInputKind = "text" | "number" | "date" | "datetime"

type FilterValueInputProps = {
  name: string
  kind: FreeTextInputKind
  enableVariables: boolean
  label?: string
}

type ValueRenderContext = {
  enableVariables: boolean
  valueOptions: SelectOption[]
}

const FILTER_VALUE_INPUT_CONFIG = {
  text: {
    placeholderKey: "condition.valuePlaceholder",
    type: undefined,
  },
  number: {
    placeholderKey: "condition.valuePlaceholder",
    type: "number",
  },
  date: {
    placeholderKey: "condition.datePlaceholder",
    type: undefined,
  },
  datetime: {
    placeholderKey: "condition.datetimePlaceholder",
    type: undefined,
  },
} as const satisfies Record<
  FreeTextInputKind,
  { placeholderKey: string; type: "number" | undefined }
>

const BooleanValueField = () => {
  const t = useTranslations()

  return (
    <SelectField
      name="value"
      options={[
        { label: t("condition.yes"), value: "true" },
        { label: t("condition.no"), value: "false" },
      ]}
    />
  )
}

const FilterValueInput = ({
  name,
  kind,
  enableVariables,
  label,
}: FilterValueInputProps) => {
  const t = useTranslations()
  const inputConfig = FILTER_VALUE_INPUT_CONFIG[kind]
  const placeholder = t(inputConfig.placeholderKey)

  if (enableVariables) {
    return (
      <PlainTextEditorField
        formItemClassName="w-full"
        inline
        label={label}
        name={name}
        placeholder={placeholder}
        showEmojiPicker={false}
      />
    )
  }

  return (
    <InputField
      label={label}
      name={name}
      placeholder={placeholder}
      type={inputConfig.type}
    />
  )
}

const IntervalValueInput = ({
  kind,
  enableVariables,
}: {
  kind: "number" | "datetime"
  enableVariables: boolean
}) => {
  const t = useTranslations()

  return (
    <div className="flex flex-col gap-2">
      <FilterValueInput
        enableVariables={enableVariables}
        kind={kind}
        label={t("fields.from.label")}
        name="value.0"
      />
      <FilterValueInput
        enableVariables={enableVariables}
        kind={kind}
        label={t("fields.to.label")}
        name="value.1"
      />
    </div>
  )
}

const VALUE_INPUT_RENDERERS = {
  none: () => null,
  text: ({ enableVariables }) => (
    <FilterValueInput
      enableVariables={enableVariables}
      kind="text"
      name="value"
    />
  ),
  number: ({ enableVariables }) => (
    <FilterValueInput
      enableVariables={enableVariables}
      kind="number"
      name="value"
    />
  ),
  date: ({ enableVariables }) => (
    <FilterValueInput
      enableVariables={enableVariables}
      kind="date"
      name="value"
    />
  ),
  datetime: ({ enableVariables }) => (
    <FilterValueInput
      enableVariables={enableVariables}
      kind="datetime"
      name="value"
    />
  ),
  boolean: () => <BooleanValueField />,
  select: ({ valueOptions }) => (
    <SelectField name="value" options={valueOptions} />
  ),
  multiSelect: ({ valueOptions }) => (
    <MultiSelectField name="value" options={valueOptions} />
  ),
  numberInterval: ({ enableVariables }) => (
    <IntervalValueInput enableVariables={enableVariables} kind="number" />
  ),
  datetimeInterval: ({ enableVariables }) => (
    <IntervalValueInput enableVariables={enableVariables} kind="datetime" />
  ),
} as const satisfies Record<
  ValueInputKind,
  (ctx: ValueRenderContext) => ReactNode
>

export const isValidDateTimeConditionValue = (value: unknown): boolean => {
  if (Array.isArray(value)) {
    return value.every(isValidDateTimeConditionValue)
  }
  return (
    typeof value === "string" &&
    (valueContainsVariablePlaceholder(value) ||
      isValidDateTimeFilterValue(value))
  )
}

const parseSaveableCondition = ({
  draft,
  config,
  valueInputKind,
}: {
  draft: ContactFilterConditionFormDraft
  config: FieldConfig | undefined
  valueInputKind: ValueInputKind
}): ContactFilterCondition | null => {
  const parsed = singleContactFilterConditionSchema.safeParse(
    buildConditionDraft(draft, config),
  )
  if (!parsed.success) {
    return null
  }

  if (
    DATETIME_VALUE_INPUT_KINDS.has(valueInputKind) &&
    !isValidDateTimeConditionValue(draft.value)
  ) {
    return null
  }

  return parsed.data
}

const ContactFilterValueFields = ({
  valueType,
  valueOptions,
  customFieldInput,
  enableVariables,
}: ContactFilterValueFieldsProps) => {
  const kind = resolveValueInputKind(customFieldInput, valueType)

  return VALUE_INPUT_RENDERERS[kind]({ enableVariables, valueOptions })
}

type ContactFilterConditionDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  initialDraft: ContactFilterConditionFormDraft
  onSubmit: (data: ContactFilterCondition) => void
  configs: FieldConfig[]
  conditionOptions: ConditionOption[]
  enableVariables?: boolean
}

export const ContactFilterConditionDialog = ({
  open,
  onOpenChange,
  title,
  initialDraft,
  onSubmit,
  configs,
  conditionOptions,
  enableVariables = false,
}: ContactFilterConditionDialogProps) => {
  const t = useTranslations()
  const form = useForm<ContactFilterConditionFormDraft>({
    defaultValues: initialDraft,
  })
  const { control, setValue, getValues, handleSubmit } = form

  const watchField = useWatch({ control, name: "field" })
  const watchOperator = useWatch({ control, name: "operator" })
  const watchValue = useWatch({ control, name: "value" })

  const activeConfig = useMemo(
    () => configs.find((config) => config.name === watchField),
    [configs, watchField],
  )

  const fieldOptions = useMemo(() => getFieldOptions(configs, t), [configs, t])

  const activeOperationsList = useMemo(
    () => getConditionOptionsForConfig(activeConfig, conditionOptions),
    [activeConfig, conditionOptions],
  )

  const { valueType, valueOptions } = useMemo<{
    valueType: FormFieldType | null
    valueOptions: SelectOption[]
  }>(() => {
    // Drive the value input off the selected field, not the operator: as soon as
    // a field is chosen its value input shows. Only hide it for operators that
    // genuinely take no value (isEmpty / isNotEmpty).
    if (!activeConfig) {
      return { valueType: null, valueOptions: [] }
    }
    if (watchOperator && OPERATORS_WITHOUT_VALUE.includes(watchOperator)) {
      return { valueType: null, valueOptions: [] }
    }
    return {
      valueType: activeConfig.formField,
      valueOptions: activeConfig.options ?? [],
    }
  }, [watchOperator, activeConfig])

  const customFieldInput = useMemo(
    () => getCustomFieldValueInputConfig(activeConfig, watchOperator),
    [activeConfig, watchOperator],
  )
  const couponTopicInput = useMemo(
    () => getCouponTopicValueInputConfig(activeConfig, watchOperator),
    [activeConfig, watchOperator],
  )
  const staticFieldInput = useMemo(
    () => getStaticFieldValueInputConfig(activeConfig, watchOperator),
    [activeConfig, watchOperator],
  )
  const resolvedFieldInput =
    customFieldInput ?? couponTopicInput ?? staticFieldInput
  const valueInputKind = useMemo(
    () => resolveValueInputKind(resolvedFieldInput, valueType),
    [resolvedFieldInput, valueType],
  )

  const canSaveCondition = useMemo(() => {
    if (!(watchField && watchOperator)) {
      return false
    }

    const draft = {
      field: watchField,
      operator: watchOperator,
      value: watchValue ?? "",
    } satisfies ContactFilterConditionFormDraft

    return (
      parseSaveableCondition({
        draft,
        config: activeConfig,
        valueInputKind,
      }) !== null
    )
  }, [watchField, watchOperator, watchValue, activeConfig, valueInputKind])

  const triggerFieldChange = useCallback(
    (nextField: string) => {
      const nextConfig = configs.find((config) => config.name === nextField)
      const resetDraft = getResetDraftForField(nextConfig, conditionOptions)
      setValue("operator", resetDraft.operator)
      setValue("value", resetDraft.value)
    },
    [configs, conditionOptions, setValue],
  )

  const triggerOperatorChange = useCallback(
    (nextOperator?: string) => {
      const currentValue = getValues("value")
      if (nextOperator && OPERATORS_WITHOUT_VALUE.includes(nextOperator)) {
        setValue("value", "")
        return
      }
      if (
        activeConfig?.customFieldId &&
        customFieldOperatorRequiresArrayValue(nextOperator)
      ) {
        if (Array.isArray(currentValue)) {
          return
        }
        setValue(
          "value",
          getDefaultConditionValue(activeConfig, nextOperator ?? ""),
        )
        return
      }
      if (
        !activeConfig?.customFieldId &&
        staticFieldOperatorRequiresArrayValue(activeConfig, nextOperator)
      ) {
        if (Array.isArray(currentValue)) {
          return
        }
        setValue(
          "value",
          getDefaultConditionValue(activeConfig, nextOperator ?? ""),
        )
        return
      }
      if (Array.isArray(currentValue)) {
        setValue("value", "")
      }
    },
    [activeConfig, getValues, setValue],
  )

  const handleCancel = useCallback(() => {
    onOpenChange(false)
  }, [onOpenChange])

  const submitCondition = handleSubmit(() => {
    const parsed = parseSaveableCondition({
      draft: getValues(),
      config: activeConfig,
      valueInputKind,
    })
    if (!parsed) {
      return
    }

    onSubmit(parsed)
    onOpenChange(false)
  })

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className={`${CONTACT_FILTER_DIALOG_SIZE_CLASS} overflow-visible`}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription />
        </DialogHeader>

        <Form {...form}>
          <form
            className="flex flex-col gap-6"
            onSubmit={(event) => {
              event.stopPropagation()
              event.preventDefault()
              submitCondition()
            }}
          >
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <ComboboxField
                className="overflow-hidden truncate"
                emptyText={t("actions.noRecordFound")}
                name="field"
                options={fieldOptions}
                placeholder={t("actions.pleaseSelect")}
                popoverClassName="w-[var(--anchor-width)]"
                portal
                triggerValueChange={triggerFieldChange}
              />
              <SelectField
                name="operator"
                options={activeOperationsList}
                triggerValueChange={triggerOperatorChange}
              />
              <div className="overflow-hidden truncate">
                <ContactFilterValueFields
                  customFieldInput={resolvedFieldInput}
                  enableVariables={enableVariables}
                  valueOptions={valueOptions}
                  valueType={valueType}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                onClick={handleCancel}
                size="sm"
                type="button"
                variant="ghost"
              >
                {t("actions.cancel")}
              </Button>
              <Button
                className="w-20"
                disabled={!canSaveCondition}
                size="sm"
                type="submit"
              >
                {t("actions.save")}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

type ContactFilterConditionEditDialogProps = {
  condition: ContactFilterCondition
  onSubmit: (data: ContactFilterCondition) => void
  onClose: () => void
  configs: FieldConfig[]
  conditionOptions: ConditionOption[]
  enableVariables?: boolean
}

export const ContactFilterConditionEditDialog = ({
  condition,
  onSubmit,
  onClose,
  configs,
  conditionOptions,
  enableVariables = false,
}: ContactFilterConditionEditDialogProps) => {
  const t = useTranslations()

  return (
    <ContactFilterConditionDialog
      conditionOptions={conditionOptions}
      configs={configs}
      enableVariables={enableVariables}
      initialDraft={buildDraftFromCondition(condition)}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onClose()
        }
      }}
      onSubmit={onSubmit}
      open
      title={t("actions.editFeature", {
        feature: t("fields.condition.label"),
      })}
    />
  )
}
