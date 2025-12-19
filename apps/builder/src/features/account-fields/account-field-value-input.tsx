"use client"

import { CustomFieldType } from "@aha.chat/database/types"
import { InputField } from "@aha.chat/ui/components/form/input-field"
import { SelectField } from "@aha.chat/ui/components/form/select-field"
import { TextareaField } from "@aha.chat/ui/components/form/textarea-field"
import { DateTimePicker } from "@aha.chat/ui/components/ui/date-picker"
import { format } from "date-fns"
import { useTranslations } from "next-intl"
import { useFormContext } from "react-hook-form"

type AccountFieldValueInputProps = {
  name?: string
  customFieldType: CustomFieldType
}

export const AccountFieldValueInput = ({
  name = "value",
  customFieldType,
}: AccountFieldValueInputProps) => {
  const t = useTranslations()
  const { setValue } = useFormContext()

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
      const dateFormat = "yyyy-MM-dd"
      return (
        <DateTimePicker
          displayFormat={{ hour24: dateFormat }}
          granularity="day"
          onChange={(value) => {
            setValue("value", format(value ?? new Date(), dateFormat))
          }}
          value={new Date()}
        />
      )
    }
    case CustomFieldType.datetime: {
      const dateTimeFormat = "yyyy-MM-dd HH:mm"
      return (
        <DateTimePicker
          displayFormat={{ hour24: dateTimeFormat }}
          onChange={(value) => {
            setValue("value", format(value ?? new Date(), dateTimeFormat))
          }}
          value={new Date()}
        />
      )
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
