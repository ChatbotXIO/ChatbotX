"use client"

import type { CustomFieldType } from "@aha.chat/database/types"
import {
  DatePickerField,
  DateTimePickerField,
} from "@aha.chat/ui/components/form/date-picker-field"
import { InputField } from "@aha.chat/ui/components/form/input-field"
import { SelectField } from "@aha.chat/ui/components/form/select-field"
import { TextareaField } from "@aha.chat/ui/components/form/textarea-field"
import { useTranslations } from "next-intl"

type BotFieldValueInputProps = {
  name?: string
  type: CustomFieldType
}

export const BotFieldValueInput = ({
  name = "value",
  type,
}: BotFieldValueInputProps) => {
  const t = useTranslations()

  switch (type) {
    case "number":
      return (
        <InputField
          name={name}
          placeholder={t("fields.number.placeholder")}
          type="number"
        />
      )
    case "boolean":
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
    case "date": {
      return <DatePickerField name={name} />
    }
    case "datetime": {
      const dateTimeFormat = "yyyy-MM-dd HH:mm"
      return <DateTimePickerField dateTimeFormat={dateTimeFormat} name={name} />
    }
    case "longText":
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
