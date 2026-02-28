"use client"

import {
  ConditionField,
  type ConditionFieldType,
  ConditionType,
  Operator,
} from "@aha.chat/database/enums"
import { ComboboxField } from "@aha.chat/ui/components/form/combobox-field"
import { DateTimePickerField } from "@aha.chat/ui/components/form/date-picker-field"
import { InputField } from "@aha.chat/ui/components/form/input-field"
import { MultiSelectField } from "@aha.chat/ui/components/form/multi-select-field"
import { RadioGroupField } from "@aha.chat/ui/components/form/radio-group-field"
import {
  SelectField,
  type SelectOption,
} from "@aha.chat/ui/components/form/select-field"
import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@aha.chat/ui/components/ui/dialog"
import { Form } from "@aha.chat/ui/components/ui/form"
import { Label } from "@aha.chat/ui/components/ui/label"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2Icon, PlusIcon, TrashIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react"
import {
  useFieldArray,
  useForm,
  useFormContext,
  useWatch,
} from "react-hook-form"
import z from "zod"
import {
  allContinentOptions,
  allCountryOptions,
} from "@/features/chatbot/schemas/types"
import { useCustomFieldSelectOptions } from "@/features/custom-fields/provider/custom-field-hook"
import { useFlowSelectOptions } from "@/features/flows/provider/flow-hook"
import { useTagSelectOptions } from "@/features/tags/provider/tag-hook"
import {
  type ContactFilterRequest,
  contactFilterRequest,
} from "../schemas/query"

type ContactFilterProps = {
  parentName: string
}

type ConditionOption = {
  value: Operator
  label: string
  disabled: boolean
}

type FieldConfig = {
  name: ConditionFieldType
  conditionType: ConditionType
  options?: SelectOption[]
}

const MAPPING_CONDITIONS: Record<ConditionType, Operator[]> = {
  [ConditionType.multiSelect]: [
    Operator.is,
    Operator.isNot,
    Operator.hasNoValue,
  ],
  [ConditionType.select]: [Operator.is, Operator.isNot, Operator.hasNoValue],
  [ConditionType.text]: [
    Operator.is,
    Operator.isNot,
    Operator.hasAnyValue,
    Operator.hasNoValue,
    Operator.contains,
    Operator.doesNotContain,
    Operator.startsWith,
    Operator.endsWith,
  ],
  [ConditionType.boolean]: [Operator.is, Operator.hasNoValue],
  [ConditionType.datetime]: [
    Operator.is,
    Operator.isNot,
    Operator.hasNoValue,
    Operator.greaterThan,
    Operator.lessThan,
    Operator.greaterThanOrEqualTo,
    Operator.lessThanOrEqualTo,
    Operator.interval,
    Operator.notInterval,
  ],
  [ConditionType.number]: [
    Operator.is,
    Operator.isNot,
    Operator.hasNoValue,
    Operator.greaterThan,
    Operator.lessThan,
    Operator.greaterThanOrEqualTo,
    Operator.lessThanOrEqualTo,
    Operator.contains,
    Operator.doesNotContain,
    Operator.startsWith,
    Operator.endsWith,
    Operator.interval,
    Operator.notInterval,
  ],
}

const contactFilterRowSchema = z.object({
  field: z.string(),
  operator: z.string(),
  value: z.union([z.string(), z.array(z.string())]),
})
type ContactFilterRowSchema = z.infer<typeof contactFilterRowSchema>

const getFieldConfigs = ({
  t,
  tagOptions,
  customFieldOptions,
  flowVersionOptions,
}: {
  t: (key: string) => string
  tagOptions: SelectOption[]
  customFieldOptions: SelectOption[]
  flowVersionOptions: SelectOption[]
}): FieldConfig[] => [
  {
    name: ConditionField.language,
    conditionType: ConditionType.multiSelect,
    options: allCountryOptions,
  },
  {
    name: ConditionField.fullName,
    conditionType: ConditionType.text,
  },
  {
    name: ConditionField.country,
    conditionType: ConditionType.multiSelect,
    options: allCountryOptions,
  },
  {
    name: ConditionField.continent,
    conditionType: ConditionType.multiSelect,
    options: allContinentOptions,
  },
  {
    name: ConditionField.gender,
    conditionType: ConditionType.select,
    options: [
      {
        label: t("fields.gender.male"),
        value: "male",
      },
      {
        label: t("fields.gender.female"),
        value: "female",
      },
      {
        label: t("fields.gender.unknown"),
        value: "unknown",
      },
    ],
  },
  {
    name: ConditionField.subscribedToBroadcast,
    conditionType: ConditionType.select,
    options: [
      {
        label: t("condition.yes"),
        value: "true",
      },
      {
        label: t("condition.no"),
        value: "false",
      },
    ],
  },
  {
    name: ConditionField.contactCreatedDate,
    conditionType: ConditionType.datetime,
  },
  {
    name: ConditionField.contactCreatedDateMinutesAgo,
    conditionType: ConditionType.number,
  },
  {
    name: ConditionField.source,
    conditionType: ConditionType.multiSelect,
    options: [
      {
        label: "Webchat",
        value: "webchat",
      },
      {
        label: "WhatsApp",
        value: "whatsapp",
      },
      {
        label: "Facebook",
        value: "messenger",
      },
      {
        label: "Zalo",
        value: "zalo",
      },
    ],
  },
  {
    name: ConditionField.conversationTransferredToHuman,
    conditionType: ConditionType.select,
    options: [
      {
        label: "Yes",
        value: "true",
      },
      {
        label: "No",
        value: "false",
      },
    ],
  },
  {
    name: ConditionField.interactedInLast24H,
    conditionType: ConditionType.select,
    options: [
      {
        label: "Yes",
        value: "true",
      },
      {
        label: "No",
        value: "false",
      },
    ],
  },
  {
    name: ConditionField.archived,
    conditionType: ConditionType.select,
    options: [
      {
        label: "Yes",
        value: "true",
      },
      {
        label: "No",
        value: "false",
      },
    ],
  },
  {
    name: ConditionField.blocked,
    conditionType: ConditionType.select,
    options: [
      {
        label: "Yes",
        value: "true",
      },
      {
        label: "No",
        value: "false",
      },
    ],
  },
  {
    name: ConditionField.existingContact,
    conditionType: ConditionType.select,
    options: [
      {
        label: "Yes",
        value: "true",
      },
      {
        label: "No",
        value: "false",
      },
    ],
  },
  {
    name: ConditionField.currentChannel,
    conditionType: ConditionType.multiSelect,
    options: [
      {
        label: "Webchat",
        value: "webchat",
      },
      {
        label: "WhatsApp",
        value: "whatsapp",
      },
      {
        label: "Facebook",
        value: "messenger",
      },
      {
        label: "Zalo",
        value: "zalo",
      },
    ],
  },
  {
    name: ConditionField.email,
    conditionType: ConditionType.text,
  },
  {
    name: ConditionField.phone,
    conditionType: ConditionType.text,
  },
  {
    name: ConditionField.tags,
    conditionType: ConditionType.multiSelect,
    options: tagOptions,
  },
  {
    name: ConditionField.customFields,
    conditionType: ConditionType.multiSelect,
    options: customFieldOptions,
  },
  {
    name: ConditionField.executedFlow,
    conditionType: ConditionType.select,
    options: flowVersionOptions,
  },
]

const getConditionOptions = (t: (key: string) => string): ConditionOption[] => [
  {
    value: Operator.is,
    label: t("fields.operator.is"),
    disabled: true,
  },
  {
    value: Operator.isNot,
    label: t("fields.operator.isNot"),
    disabled: true,
  },
  {
    value: Operator.hasNoValue,
    label: t("fields.operator.hasNoValue"),
    disabled: true,
  },
  {
    value: Operator.hasAnyValue,
    label: t("fields.operator.hasAnyValue"),
    disabled: true,
  },
  {
    value: Operator.greaterThan,
    label: t("fields.operator.greaterThan"),
    disabled: true,
  },
  {
    value: Operator.lessThan,
    label: t("fields.operator.lessThan"),
    disabled: true,
  },
  {
    value: Operator.greaterThanOrEqualTo,
    label: t("fields.operator.greaterThanOrEqualTo"),
    disabled: true,
  },
  {
    value: Operator.lessThanOrEqualTo,
    label: t("fields.operator.lessThanOrEqualTo"),
    disabled: true,
  },
  {
    value: Operator.contains,
    label: t("fields.operator.contains"),
    disabled: true,
  },
  {
    value: Operator.doesNotContain,
    label: t("fields.operator.doesNotContain"),
    disabled: true,
  },
  {
    value: Operator.startsWith,
    label: t("fields.operator.startsWith"),
    disabled: true,
  },
  {
    value: Operator.endsWith,
    label: t("fields.operator.endsWith"),
    disabled: true,
  },
  {
    value: Operator.interval,
    label: t("fields.operator.interval"),
    disabled: true,
  },
  {
    value: Operator.notInterval,
    label: t("fields.operator.notInterval"),
    disabled: true,
  },
]

export function ContactFilterDialog() {
  const t = useTranslations()
  const [open, setOpen] = useState(false)

  const { getValues: getParentValues, setValue: setParentValue } =
    useFormContext()

  const contactFilterForm = useForm({
    resolver: zodResolver(contactFilterRequest),
    defaultValues: {
      contactFilter: {
        operator: "and",
        conditions: [],
      },
    },
  })

  useEffect(() => {
    if (open) {
      contactFilterForm.reset({
        contactFilter: getParentValues("contactFilter"),
      })
    }
  }, [open, getParentValues, contactFilterForm])

  const handleSubmit = (data: ContactFilterRequest) => {
    setParentValue("contactFilter", data.contactFilter)
    setOpen(false)
  }

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <Button>
          {t("actions.addFeature", {
            feature: t("fields.contactFilter.label"),
          })}
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t("actions.addFeature", {
              feature: t("fields.contactFilter.label"),
            })}
          </DialogTitle>
          <DialogDescription />
        </DialogHeader>

        <Form {...contactFilterForm}>
          <form
            className="flex flex-col gap-6"
            onSubmit={contactFilterForm.handleSubmit(handleSubmit)}
          >
            <ContactFilter parentName="contactFilter" />

            <DialogFooter>
              <Button
                onClick={() => setOpen(false)}
                size="sm"
                type="button"
                variant="ghost"
              >
                {t("actions.cancel")}
              </Button>
              <Button
                disabled={!contactFilterForm.formState.isValid}
                size="sm"
                type="submit"
              >
                {t("actions.continue")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

export function ContactFilter({ parentName }: ContactFilterProps) {
  const t = useTranslations()
  const { control } = useFormContext()
  const { append, remove } = useFieldArray({
    control,
    name: `${parentName}.conditions`,
  })

  const conditionRows = useWatch({
    control,
    name: `${parentName}.conditions`,
  })

  const tagOptions = useTagSelectOptions()
  const customFieldOptions = useCustomFieldSelectOptions({})
  const flowVersionOptions = useFlowSelectOptions()

  const configs = useMemo(
    () =>
      getFieldConfigs({
        t,
        tagOptions,
        customFieldOptions,
        flowVersionOptions,
      }),
    [t, tagOptions, customFieldOptions, flowVersionOptions],
  )

  const onAdd = (data: ContactFilterRowSchema) => {
    append(data)
  }

  return (
    <div className="flex flex-col gap-2">
      <Label>{t("fields.contactFilter.label")}</Label>

      <RadioGroupField
        name={`${parentName}.operator`}
        options={[
          {
            label: t("fields.matchAll.label"),
            value: "and",
          },
          {
            label: t("fields.matchAny.label"),
            value: "or",
          },
        ]}
      />

      {conditionRows.map((row: ContactFilterRowSchema, index: number) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: safe index
        <div className="flex gap-2" key={index}>
          <div className="flex flex-1 items-center gap-2">
            <span className="font-medium text-sm">
              {t(`condition.fields.${row.field}`)}
            </span>
            <span className="font-medium text-sm italic">
              {
                getConditionOptions(t).find((c) => c.value === row.operator)
                  ?.label
              }
            </span>
            <span className="text-sm">
              {(() => {
                const fieldConfig = configs.find((c) => c.name === row.field)
                if (!fieldConfig?.options) {
                  return Array.isArray(row.value)
                    ? row.value.join(", ")
                    : row.value
                }
                const getLabel = (val: string) =>
                  fieldConfig.options?.find((opt) => opt.value === val)
                    ?.label ?? val

                if (Array.isArray(row.value)) {
                  return row.value.map(getLabel).join(", ")
                }
                return getLabel(row.value as string)
              })()}
            </span>
          </div>
          <Button
            className="text-destructive"
            onClick={() => remove(index)}
            variant="ghost"
          >
            <TrashIcon size={20} />
          </Button>
        </div>
      ))}

      <ContactFilterCondition onAdd={onAdd} />
    </div>
  )
}

function ContactFilterCondition({
  onAdd,
}: {
  onAdd: (data: ContactFilterRowSchema) => void
}) {
  const t = useTranslations()
  const [open, setOpen] = useState(false)

  const tagOptions = useTagSelectOptions()
  const customFieldOptions = useCustomFieldSelectOptions({})
  const flowVersionOptions = useFlowSelectOptions()

  const conditionOptions = useMemo(() => getConditionOptions(t), [t])

  const configs = useMemo(
    () =>
      getFieldConfigs({
        t,
        tagOptions,
        customFieldOptions,
        flowVersionOptions,
      }),
    [t, tagOptions, customFieldOptions, flowVersionOptions],
  )

  const [valueType, setValueType] = useState<ConditionType | null>(null)
  const [valueOptions, setValueOptions] = useState<
    { value: string; label: string }[]
  >([])

  const form = useForm({
    resolver: zodResolver(contactFilterRowSchema),
    defaultValues: {
      field: "",
      operator: "",
      value: "",
    },
  })
  const { control, setValue } = form

  const watchField = useWatch({ control, name: "field" })
  const watchOperator = useWatch({ control, name: "operator" })

  const activeOperationsList = useMemo(() => {
    if (!watchField) {
      return conditionOptions
    }

    const activeConfig = configs.find((c) => c.name === watchField)
    const enableOperators = activeConfig
      ? MAPPING_CONDITIONS[activeConfig.conditionType]
      : []

    return conditionOptions.map((option) => ({
      ...option,
      disabled: !enableOperators.includes(option.value),
    }))
  }, [watchField, conditionOptions, configs])

  const triggerFieldChange = useCallback(
    (value: string) => {
      const activeConfig = configs.find((c) => c.name === value)
      if (activeConfig) {
        setValue("operator", "")
        setValue("value", "")
      }
    },
    [configs, setValue],
  )

  const handleReset = useCallback(() => {
    form.reset()
  }, [form])

  useEffect(() => {
    if (!(watchField && watchOperator)) {
      setValueType(null)
      setValueOptions([])
      if (!watchOperator) {
        setValue("value", "")
      }
      return
    }

    const activeConfig = configs.find((c) => c.name === watchField)

    if (activeConfig) {
      if (
        watchOperator === Operator.hasNoValue ||
        watchOperator === Operator.hasAnyValue
      ) {
        setValueType(null)
        setValueOptions([])
      } else {
        setValueType(activeConfig.conditionType)
        setValueOptions(activeConfig.options || [])
      }
    } else {
      setValueType(null)
      setValueOptions([])
    }
  }, [watchField, watchOperator, setValue, configs])

  const fieldOptions = useMemo(
    () =>
      configs.map((config) => ({
        label: t(`condition.fields.${config.name}`),
        value: config.name,
      })),
    [configs, t],
  )

  const onConfirm = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    e.stopPropagation()

    onAdd(form.getValues())

    form.reset()
    setOpen(false)
  }

  return (
    <Dialog onOpenChange={setOpen} open={open}>
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
          <form className="flex flex-col gap-6" onSubmit={onConfirm}>
            <div className="grid grid-cols-3 gap-2">
              <ComboboxField
                className="overflow-hidden truncate"
                name="field"
                options={fieldOptions}
                triggerValueChange={triggerFieldChange}
              />
              <SelectField name="operator" options={activeOperationsList} />
              <div className="overflow-hidden truncate">
                {valueType === ConditionType.text && (
                  <InputField name="value" />
                )}
                {valueType === ConditionType.number && (
                  <InputField name="value" type="number" />
                )}
                {valueType === ConditionType.select && (
                  <SelectField name="value" options={valueOptions} />
                )}
                {valueType === ConditionType.multiSelect && (
                  <MultiSelectField name="value" options={valueOptions} />
                )}
                {valueType === ConditionType.datetime && (
                  <DateTimePickerField
                    dateTimeFormat="yyyy-MM-dd HH:mm"
                    granularity="minute"
                    name="value"
                    required
                  />
                )}
                {!valueType && <div> </div>}
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                onClick={() => {
                  handleReset()
                  setOpen(false)
                }}
                size="sm"
                type="button"
                variant="ghost"
              >
                {t("actions.cancel")}
              </Button>
              <Button
                className="w-20"
                disabled={
                  !form.formState.isValid || form.formState.isSubmitting
                }
                size="sm"
                type="submit"
              >
                {form.formState.isSubmitting && (
                  <Loader2Icon className="animate-spin" />
                )}
                {t("actions.add")}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
