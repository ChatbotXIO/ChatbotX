"use client"

import {
  type FormFieldType,
  formFieldTypes,
  operatorTypes,
} from "@chatbotx.io/database/partials"
import { ComboboxField } from "@chatbotx.io/ui/components/form/combobox-field"
import { DateTimePickerField } from "@chatbotx.io/ui/components/form/date-picker-field"
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
import { useCallback, useMemo } from "react"
import { useForm, useWatch } from "react-hook-form"
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

const OPERATORS_WITHOUT_VALUE: string[] = [
  operatorTypes.enum.isEmpty,
  operatorTypes.enum.isNotEmpty,
]

const getFirstEnabledOperator = (
  options: { value: string; disabled?: boolean }[],
) => options.find((option) => !option.disabled)?.value ?? ""

/**
 * Maps a raw form draft to the condition shape validated by
 * `singleContactFilterConditionSchema`. Static fields pass through unchanged;
 * a custom-field config (`customField:<id>`) becomes the dynamic
 * `{ field: "customField", customFieldId, valueType }` branch.
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

  return shouldOmitValue
    ? {
        field: values.field,
        operator,
      }
    : values
}

/** Inverse of buildConditionDraft; used to prefill the edit form. */
export const buildDraftFromCondition = (
  condition: ContactFilterCondition,
): ContactFilterConditionFormDraft => ({
  field:
    condition.field === "customField" && "customFieldId" in condition
      ? `customField:${condition.customFieldId}`
      : condition.field,
  operator: condition.operator,
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
  return getStaticFieldConditionOptions(config, conditionOptions)
}

export const getDefaultConditionValue = (
  config: FieldConfig | undefined,
  operator: string,
): string | string[] =>
  config?.customFieldId
    ? getDefaultCustomFieldValue(config, operator)
    : getDefaultStaticFieldValue(config, operator)

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
}

const ContactFilterValueFields = ({
  valueType,
  valueOptions,
  customFieldInput,
}: ContactFilterValueFieldsProps) => {
  const t = useTranslations()

  if (customFieldInput?.kind === "none") {
    return <div> </div>
  }

  if (customFieldInput?.kind === "text") {
    return <InputField name="value" />
  }

  if (customFieldInput?.kind === "number") {
    return <InputField name="value" type="number" />
  }

  if (customFieldInput?.kind === "datetime") {
    return (
      <DateTimePickerField
        dateTimeFormat="yyyy-MM-dd HH:mm"
        granularity="minute"
        name="value"
        required
      />
    )
  }

  if (customFieldInput?.kind === "boolean") {
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

  if (customFieldInput?.kind === "numberInterval") {
    return (
      <div className="flex flex-col gap-2">
        <InputField
          label={t("fields.from.label")}
          name="value.0"
          type="number"
        />
        <InputField label={t("fields.to.label")} name="value.1" type="number" />
      </div>
    )
  }

  if (customFieldInput?.kind === "datetimeInterval") {
    return (
      <div className="flex flex-col gap-2">
        <DateTimePickerField
          dateTimeFormat="yyyy-MM-dd HH:mm"
          granularity="minute"
          label={t("fields.from.label")}
          name="value.0"
          required
        />
        <DateTimePickerField
          dateTimeFormat="yyyy-MM-dd HH:mm"
          granularity="minute"
          label={t("fields.to.label")}
          name="value.1"
          required
        />
      </div>
    )
  }

  if (valueType === formFieldTypes.enum.text) {
    return <InputField name="value" />
  }

  if (valueType === formFieldTypes.enum.number) {
    return <InputField name="value" type="number" />
  }

  if (valueType === formFieldTypes.enum.select) {
    return <SelectField name="value" options={valueOptions} />
  }

  if (valueType === formFieldTypes.enum.multiSelect) {
    return <MultiSelectField name="value" options={valueOptions} />
  }

  if (valueType === formFieldTypes.enum.boolean) {
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

  if (valueType === formFieldTypes.enum.datetime) {
    return (
      <DateTimePickerField
        dateTimeFormat="yyyy-MM-dd HH:mm"
        granularity="minute"
        name="value"
        required
      />
    )
  }

  return <div> </div>
}

type ContactFilterConditionDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  initialDraft: ContactFilterConditionFormDraft
  onSubmit: (data: ContactFilterCondition) => void
  configs: FieldConfig[]
  conditionOptions: ConditionOption[]
}

export const ContactFilterConditionDialog = ({
  open,
  onOpenChange,
  title,
  initialDraft,
  onSubmit,
  configs,
  conditionOptions,
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
  const staticFieldInput = useMemo(
    () => getStaticFieldValueInputConfig(activeConfig, watchOperator),
    [activeConfig, watchOperator],
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

    return singleContactFilterConditionSchema.safeParse(
      buildConditionDraft(draft, activeConfig),
    ).success
  }, [watchField, watchOperator, watchValue, activeConfig])

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
    const parsed = singleContactFilterConditionSchema.safeParse(
      buildConditionDraft(getValues(), activeConfig),
    )
    if (!parsed.success) {
      return
    }

    onSubmit(parsed.data)
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
                popoverClassName="w-[var(--radix-popover-trigger-width)]"
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
                  customFieldInput={customFieldInput ?? staticFieldInput}
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
}

export const ContactFilterConditionEditDialog = ({
  condition,
  onSubmit,
  onClose,
  configs,
  conditionOptions,
}: ContactFilterConditionEditDialogProps) => {
  const t = useTranslations()

  return (
    <ContactFilterConditionDialog
      conditionOptions={conditionOptions}
      configs={configs}
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
