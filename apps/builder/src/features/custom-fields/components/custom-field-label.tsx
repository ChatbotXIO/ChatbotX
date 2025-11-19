"use client"

import { CustomFieldType } from "@aha.chat/database/types"
import { useTranslations } from "next-intl"
import { useMemo } from "react"

const getTranslationKey = (fieldType: CustomFieldType): string => {
  switch (fieldType) {
    case CustomFieldType.number:
      return "fields.number.label"
    case CustomFieldType.date:
      return "fields.date.label"
    case CustomFieldType.datetime:
      return "fields.datetime.label"
    case CustomFieldType.boolean:
      return "fields.boolean.label"
    case CustomFieldType.longText:
      return "fields.longText.label"
    default:
      return "fields.shortText.label"
  }
}

export default function CustomFieldLabel({
  customFieldType,
}: {
  customFieldType: CustomFieldType
}) {
  const t = useTranslations()
  const label = useMemo(
    () => t(getTranslationKey(customFieldType)),
    [t, customFieldType],
  )

  return <div>{label}</div>
}
