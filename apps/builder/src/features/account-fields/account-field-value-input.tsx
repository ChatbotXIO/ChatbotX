"use client"

import { CustomFieldType } from "@aha.chat/database/types"
import {
  DatePickerField,
  DateTimePickerField,
} from "@aha.chat/ui/components/form/date-picker-field"
import { InputField } from "@aha.chat/ui/components/form/input-field"
import { SelectField } from "@aha.chat/ui/components/form/select-field"
import { TextareaField } from "@aha.chat/ui/components/form/textarea-field"
import { useTranslations } from "next-intl"

type AccountFieldValueInputProps = {
  name?: string
  customFieldType: CustomFieldType
}

export const AccountFieldValueInput = ({
  name = "value",
  customFieldType,
}: AccountFieldValueInputProps) => {
  const t = useTranslations()

  switch (customFieldType) {
    case CustomFieldType.number:
      return (
        <InputField
          name={name}
          placeholder={t("fields.number.placeholder")}
          type="number"
        />
      )
    case CustomFieldType.boolean:
      return (
        <SelectField
          name={name}
          options={[
            { label: t("fields.boolean.true"), value: "true" },
            { label: t("fields.boolean.false"), value: "false" },
          ]}
          placeholder={t("fields.boolean.placeholder")}
        />
      )
    case CustomFieldType.date: {
      return <DatePickerField name={name} />
    }
    case CustomFieldType.datetime: {
      const dateTimeFormat = "yyyy-MM-dd HH:mm"
      return <DateTimePickerField dateTimeFormat={dateTimeFormat} name={name} />
    }
    case CustomFieldType.longText:
      return (
        <TextareaField
          name={name}
          placeholder={t("fields.shortText.placeholder")}
        />
      )
    default:
      return (
        <InputField
          name={name}
          placeholder={t("fields.shortText.placeholder")}
        />
      )
  }
}
