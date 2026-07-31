import {
  type CustomFieldType,
  customFieldTypes,
  operatorTypes,
} from "@chatbotx.io/database/partials"
import { DateTimePicker } from "@chatbotx.io/ui/components/ui/date-picker"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@chatbotx.io/ui/components/ui/select"
import { Textarea } from "@chatbotx.io/ui/components/ui/textarea"
import { useTranslations } from "next-intl"
import { useMemo } from "react"
import { Controller, useFormContext } from "react-hook-form"
import {
  convertCustomFieldTypeToConditionType,
  getConditionOptions,
} from "@/features/contact-filter/components/contact-filter-config"
import { getBrowserTimezone } from "@/features/contact-filter/lib/timezone"
import { mappingConditions } from "@/features/contact-filter/schemas"
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
      customFields.find((field) => field.id === customFieldId)
        ?.type as CustomFieldType,
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

    const enableOperators = mappingConditions[conditionType]
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
            items={operatorOptions}
            onValueChange={(value) => {
              form.setValue(`${parentName}.operator`, value, {
                shouldValidate: true,
              })
            }}
            value={currentOperator}
          >
            <SelectTrigger>
              <SelectValue placeholder={t("actions.pleaseSelect")} />
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

          {customFieldType === customFieldTypes.enum.longText && (
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

          {customFieldType === customFieldTypes.enum.shortText && (
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

          {customFieldType === customFieldTypes.enum.number && (
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

          {customFieldType === customFieldTypes.enum.date && (
            <Controller
              control={form.control}
              name={`${parentName}.value`}
              render={({ field }) => (
                <DateTimePicker
                  displayFormat={{ hour24: "yyyy-MM-dd" }}
                  granularity="day"
                  onChange={(date: Date | undefined) =>
                    field.onChange({
                      text: date?.toISOString(),
                      timezone: getBrowserTimezone(),
                    })
                  }
                  value={
                    field.value?.text ? new Date(field.value.text) : undefined
                  }
                />
              )}
            />
          )}

          {customFieldType === customFieldTypes.enum.datetime && (
            <Controller
              control={form.control}
              name={`${parentName}.value`}
              render={({ field }) => (
                <DateTimePicker
                  onChange={(date: Date | undefined) =>
                    field.onChange({
                      text: date?.toISOString(),
                      timezone: getBrowserTimezone(),
                    })
                  }
                  value={
                    field.value?.text ? new Date(field.value.text) : undefined
                  }
                />
              )}
            />
          )}

          {customFieldType === customFieldTypes.enum.boolean &&
            form.getValues(`${parentName}.operator`) ===
              operatorTypes.enum.eq && (
              <Controller
                control={form.control}
                name={`${parentName}.value`}
                render={({ field }) => (
                  <Select
                    items={[
                      { label: t("fields.boolean.true"), value: "true" },
                      { label: t("fields.boolean.false"), value: "false" },
                    ]}
                    onValueChange={(value) =>
                      field.onChange({
                        text: value === "true" ? "true" : "false",
                      })
                    }
                    value={field.value?.text || ""}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t("actions.pleaseSelect")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">
                        {t("fields.boolean.true")}
                      </SelectItem>
                      <SelectItem value="false">
                        {t("fields.boolean.false")}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            )}
        </>
      )}
    </div>
  )
}
