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
  DialogTrigger,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { PlusIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useCallback, useMemo, useState } from "react"
import { useForm, useWatch } from "react-hook-form"
import {
  type ContactFilterCondition,
  mappingConditions,
  singleContactFilterConditionSchema,
} from "../schemas/contact-filter"
import type { ContactFilterConditionFormDraft } from "./contact-filter-config"
import { useContactFilterConfigs } from "./use-contact-filter-configs"

type ContactFilterValueFieldsProps = {
  /** `null` when operator is empty / isEmpty / isNotEmpty or no field selected */
  valueType: FormFieldType | null
  valueOptions: SelectOption[]
}

const ContactFilterValueFields = ({
  valueType,
  valueOptions,
}: ContactFilterValueFieldsProps) => {
  const t = useTranslations()

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
}

const OPERATORS_WITHOUT_VALUE: string[] = [
  operatorTypes.enum.isEmpty,
  operatorTypes.enum.isNotEmpty,
]

export const ContactFilterConditionForm = ({
  onAdd,
}: ContactFilterConditionFormProps) => {
  const t = useTranslations()
  const [open, setOpen] = useState(false)

  const { configs, conditionOptions } = useContactFilterConfigs()

  const form = useForm<ContactFilterConditionFormDraft>({
    defaultValues: {
      field: "",
      operator: "",
      value: "",
    },
  })
  const { control, setValue, reset, getValues, handleSubmit } = form

  const watchField = useWatch({ control, name: "field" })
  const watchOperator = useWatch({ control, name: "operator" })
  const watchValue = useWatch({ control, name: "value" })

  const activeConfig = useMemo(
    () => configs.find((c) => c.name === watchField),
    [configs, watchField],
  )

  const fieldOptions = useMemo(
    () =>
      configs.map((config) => ({
        label: t(`condition.fields.${config.name}`),
        value: config.name,
      })),
    [configs, t],
  )

  const activeOperationsList = useMemo(() => {
    if (!activeConfig) {
      return []
    }
    const enableOperators = mappingConditions[activeConfig.formField]
    return conditionOptions.filter((option) =>
      enableOperators.includes(option.value),
    )
  }, [activeConfig, conditionOptions])

  const { valueType, valueOptions } = useMemo<{
    valueType: FormFieldType | null
    valueOptions: SelectOption[]
  }>(() => {
    if (!(watchField && watchOperator && activeConfig)) {
      return { valueType: null, valueOptions: [] }
    }
    if (OPERATORS_WITHOUT_VALUE.includes(watchOperator)) {
      return { valueType: null, valueOptions: [] }
    }
    return {
      valueType: activeConfig.formField,
      valueOptions: activeConfig.options ?? [],
    }
  }, [watchField, watchOperator, activeConfig])

  const canAddCondition = useMemo(() => {
    if (!(watchField && watchOperator)) {
      return false
    }

    const draft = {
      field: watchField,
      operator: watchOperator,
      value: watchValue ?? "",
    } satisfies ContactFilterConditionFormDraft

    return singleContactFilterConditionSchema.safeParse(draft).success
  }, [watchField, watchOperator, watchValue])

  const triggerFieldChange = useCallback(() => {
    setValue("operator", "")
    setValue("value", "")
  }, [setValue])

  const triggerOperatorChange = useCallback(() => {
    setValue("value", "")
  }, [setValue])

  const handleOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next)
      if (!next) {
        reset()
      }
    },
    [reset],
  )

  const handleCancel = useCallback(() => {
    handleOpenChange(false)
  }, [handleOpenChange])

  const onSubmit = handleSubmit(() => {
    const parsed = singleContactFilterConditionSchema.safeParse(getValues())
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
        <Button className="w-40" size="sm" variant="outline">
          <PlusIcon size={16} />
          {t("actions.addFeature", { feature: t("fields.condition.label") })}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {t("actions.addFeature", { feature: t("fields.operator.label") })}
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
            <div className="grid grid-cols-3 gap-2">
              <ComboboxField
                className="overflow-hidden truncate"
                name="field"
                options={fieldOptions}
                triggerValueChange={triggerFieldChange}
              />
              <SelectField
                name="operator"
                options={activeOperationsList}
                triggerValueChange={triggerOperatorChange}
              />
              <div className="overflow-hidden truncate">
                <ContactFilterValueFields
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
                {t("actions.add")}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
