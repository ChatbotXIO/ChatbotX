"use client"

import {
  type ContactFilterField,
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
  DialogTrigger,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { PlusIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useCallback, useMemo, useState } from "react"
import { useForm, useWatch } from "react-hook-form"
import {
  type ContactFilterCondition,
  singleContactFilterConditionSchema,
} from "../schemas"
import {
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
import { useContactFilterConfigs } from "./use-contact-filter-configs"

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

const getFirstEnabledOperator = (
  options: { value: string; disabled?: boolean }[],
) => options.find((option) => !option.disabled)?.value ?? ""

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

type ContactFilterConditionFormProps = {
  onAdd: (data: ContactFilterCondition) => void
  excludeFields?: ContactFilterField[]
  inboxChannel?: string
}

const OPERATORS_WITHOUT_VALUE: string[] = [
  operatorTypes.enum.isEmpty,
  operatorTypes.enum.isNotEmpty,
]

const EMPTY_EXCLUDE_FIELDS: ContactFilterField[] = []

export const ContactFilterConditionForm = ({
  onAdd,
  excludeFields = EMPTY_EXCLUDE_FIELDS,
  inboxChannel,
}: ContactFilterConditionFormProps) => {
  const t = useTranslations()
  const [open, setOpen] = useState(false)

  const { configs: allConfigs, conditionOptions } =
    useContactFilterConfigs(inboxChannel)

  const configs = useMemo(
    () =>
      allConfigs.filter(
        (config) => !excludeFields.includes(config.name as ContactFilterField),
      ),
    [allConfigs, excludeFields],
  )

  const getConditionOptionsForConfig = useCallback(
    (config: FieldConfig | undefined) => {
      if (!config) {
        return []
      }
      if (config.customFieldId) {
        return getCustomFieldConditionOptions(config, conditionOptions)
      }
      return getStaticFieldConditionOptions(config, conditionOptions)
    },
    [conditionOptions],
  )

  const getInitialDraft = useCallback((): ContactFilterConditionFormDraft => {
    const firstConfig = configs[0]
    if (!firstConfig) {
      return {
        field: "",
        operator: "",
        value: "",
      }
    }

    return {
      field: firstConfig.name,
      operator: getFirstEnabledOperator(
        getConditionOptionsForConfig(firstConfig),
      ),
      value: getDefaultStaticFieldValue(
        firstConfig,
        getFirstEnabledOperator(getConditionOptionsForConfig(firstConfig)),
      ),
    }
  }, [configs, getConditionOptionsForConfig])

  const form = useForm<ContactFilterConditionFormDraft>({
    defaultValues: getInitialDraft(),
  })
  const { control, setValue, reset, getValues, handleSubmit } = form

  const watchField = useWatch({ control, name: "field" })
  const watchOperator = useWatch({ control, name: "operator" })
  const watchValue = useWatch({ control, name: "value" })

  const activeConfig = useMemo(
    () => configs.find((c) => c.name === watchField),
    [configs, watchField],
  )

  const fieldOptions = useMemo(() => getFieldOptions(configs, t), [configs, t])

  const activeOperationsList = useMemo(
    () => getConditionOptionsForConfig(activeConfig),
    [activeConfig, getConditionOptionsForConfig],
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

  const canAddCondition = useMemo(() => {
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

  const getDefaultValueForOperator = useCallback(
    (config: FieldConfig | undefined, operator: string) => {
      if (config?.customFieldId) {
        return getDefaultCustomFieldValue(config, operator)
      }
      return getDefaultStaticFieldValue(config, operator)
    },
    [],
  )

  const triggerFieldChange = useCallback(
    (nextField: string) => {
      const nextConfig = configs.find((config) => config.name === nextField)
      const nextOperator = getFirstEnabledOperator(
        getConditionOptionsForConfig(nextConfig),
      )
      setValue("operator", nextOperator)
      setValue("value", getDefaultValueForOperator(nextConfig, nextOperator))
    },
    [
      configs,
      setValue,
      getDefaultValueForOperator,
      getConditionOptionsForConfig,
    ],
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
          getDefaultValueForOperator(activeConfig, nextOperator ?? ""),
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
          getDefaultValueForOperator(activeConfig, nextOperator ?? ""),
        )
        return
      }
      if (Array.isArray(currentValue)) {
        setValue("value", "")
      }
    },
    [activeConfig, getValues, setValue, getDefaultValueForOperator],
  )

  const handleOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next)
      reset(next ? getInitialDraft() : undefined)
    },
    [getInitialDraft, reset],
  )

  const handleCancel = useCallback(() => {
    handleOpenChange(false)
  }, [handleOpenChange])

  const onSubmit = handleSubmit(() => {
    const parsed = singleContactFilterConditionSchema.safeParse(
      buildConditionDraft(getValues(), activeConfig),
    )
    if (!parsed.success) {
      return
    }

    onAdd(parsed.data as ContactFilterCondition)
    reset()
    setOpen(false)
  })

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogTrigger asChild>
        <Button
          className="h-12 w-full justify-center rounded-md border border-dashed bg-background/60 text-muted-foreground hover:bg-primary/5 hover:text-primary"
          size="sm"
          variant="ghost"
        >
          <PlusIcon size={16} />
          {t("actions.addFeature", { feature: t("fields.condition.label") })}
        </Button>
      </DialogTrigger>
      <DialogContent
        className={`${CONTACT_FILTER_DIALOG_SIZE_CLASS} overflow-visible`}
      >
        <DialogHeader>
          <DialogTitle>
            {t("actions.addFeature", { feature: t("fields.condition.label") })}
          </DialogTitle>
          <DialogDescription />
        </DialogHeader>

        <Form {...form}>
          <form
            className="flex flex-col gap-6"
            onSubmit={(e) => {
              e.stopPropagation()
              e.preventDefault()
              onSubmit()
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
                disabled={!canAddCondition}
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
