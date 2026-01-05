import { CustomFieldType } from "@aha.chat/database/types"
import { DateTimePickerField } from "@aha.chat/ui/components/form/date-picker-field"
import { InputField } from "@aha.chat/ui/components/form/input-field"
import { SelectField } from "@aha.chat/ui/components/form/select-field"
import { TextareaField } from "@aha.chat/ui/components/form/textarea-field"
import { useTranslations } from "next-intl"
import { useMemo } from "react"
import { useFormContext } from "react-hook-form"
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

  const customFieldId = form.watch(`${parentName}.customFieldId`)

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

  return (
    <div className="flex flex-col gap-4">
      <CustomFieldSelect
        label=""
        name={`${parentName}.customFieldId`}
        onValueChange={() => {
          form.resetField(`${parentName}.value`)
        }}
      />
      {customFieldId && (
        <>
          <SelectField
            name={`${parentName}.operator`}
            options={operatorOptions}
          />
          {customFieldType === CustomFieldType.longText && (
            <TextareaField name={`${parentName}.value`} />
          )}

          {customFieldType === CustomFieldType.shortText && (
            <InputField name={`${parentName}.value`} />
          )}

          {customFieldType === CustomFieldType.number && (
            <InputField name={`${parentName}.value`} type="number" />
          )}

          {customFieldType === CustomFieldType.date && (
            <DateTimePickerField
              dateTimeFormat="yyyy-MM-dd"
              granularity="day"
              name={`${parentName}.value`}
            />
          )}

          {customFieldType === CustomFieldType.datetime && (
            <DateTimePickerField name={`${parentName}.value`} />
          )}
        </>
      )}
    </div>
  )
}
