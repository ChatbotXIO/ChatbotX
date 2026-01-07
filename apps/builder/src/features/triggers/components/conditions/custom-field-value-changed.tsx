import { CustomFieldType } from "@aha.chat/database/types"
import { DateTimePicker } from "@aha.chat/ui/components/ui/date-picker"
import { Input } from "@aha.chat/ui/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@aha.chat/ui/components/ui/select"
import { Textarea } from "@aha.chat/ui/components/ui/textarea"
import { useTranslations } from "next-intl"
import { useMemo } from "react"
import { Controller, useFormContext } from "react-hook-form"
import {
  convertCustomFieldTypeToConditionType,
  getConditionOptions,
  MAPPING_CONDITIONS,
} from "@/features/contacts/components/contact-filter"
import { CustomFieldSelect } from "@/features/custom-fields/custom-field-select"
import { useCustomFieldStore } from "@/features/custom-fields/provider/custom-field-store-context"

export const CustomFieldValueChanged = ({
  parentName,
}: {
  parentName: string
}) => {
  const t = useTranslations()
  const conditionOptions = getConditionOptions(t)
  const form = useFormContext()
  const { customFields } = useCustomFieldStore((state) => state)

  const customFieldId = form.watch(`${parentName}.sourceId`)

  const customFieldType = useMemo(
    () =>
      customFields.find((field) => field.id === customFieldId)?.customFieldType,
    [customFieldId, customFields],
  )

  const conditionType = useMemo(
    () => convertCustomFieldTypeToConditionType(customFieldType),
    [customFieldType],
  )

  const operatorOptions = useMemo(() => {
    if (!customFieldId) {
      return []
    }

    const enableOperators = MAPPING_CONDITIONS[conditionType]
    return conditionOptions.map((option) => ({
      ...option,
      disabled: !enableOperators.includes(option.value),
    }))
  }, [conditionOptions, customFieldId, conditionType])

  const currentOperator = form.watch(`${parentName}.operator`)

  return (
    <div className="flex flex-col gap-4">
      <CustomFieldSelect
        label=""
        name={`${parentName}.sourceId`}
        onValueChange={() => {
          form.resetField(`${parentName}.value`)
        }}
      />
      {customFieldId && (
        <>
          <Select
            onValueChange={(value) => {
              form.setValue(`${parentName}.operator`, value, {
                shouldValidate: true,
              })
            }}
            value={currentOperator}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select operator" />
            </SelectTrigger>
            <SelectContent>
              {operatorOptions.map((option) => (
                <SelectItem
                  disabled={option.disabled}
                  key={option.value}
                  value={option.value}
                >
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {customFieldType === CustomFieldType.longText && (
            <Controller
              control={form.control}
              name={`${parentName}.value`}
              render={({ field }) => (
                <Textarea
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                    field.onChange({ text: e.target.value })
                  }
                  value={field.value?.text || ""}
                />
              )}
            />
          )}

          {customFieldType === CustomFieldType.shortText && (
            <Controller
              control={form.control}
              name={`${parentName}.value`}
              render={({ field }) => (
                <Input
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    field.onChange({ text: e.target.value })
                  }
                  value={field.value?.text || ""}
                />
              )}
            />
          )}

          {customFieldType === CustomFieldType.number && (
            <Controller
              control={form.control}
              name={`${parentName}.value`}
              render={({ field }) => (
                <Input
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    field.onChange({ text: e.target.value })
                  }
                  type="number"
                  value={field.value?.text || ""}
                />
              )}
            />
          )}

          {customFieldType === CustomFieldType.date && (
            <Controller
              control={form.control}
              name={`${parentName}.value`}
              render={({ field }) => (
                <DateTimePicker
                  displayFormat={{ hour24: "yyyy-MM-dd" }}
                  granularity="day"
                  onChange={(date: Date | undefined) =>
                    field.onChange({ text: date?.toISOString() })
                  }
                  value={
                    field.value?.text ? new Date(field.value.text) : undefined
                  }
                />
              )}
            />
          )}

          {customFieldType === CustomFieldType.datetime && (
            <Controller
              control={form.control}
              name={`${parentName}.value`}
              render={({ field }) => (
                <DateTimePicker
                  onChange={(date: Date | undefined) =>
                    field.onChange({ text: date?.toISOString() })
                  }
                  value={
                    field.value?.text ? new Date(field.value.text) : undefined
                  }
                />
              )}
            />
          )}
        </>
      )}
    </div>
  )
}
