"use client"

import type { CustomFieldType } from "@aha.chat/database/types"
import { useTranslations } from "next-intl"
import { useMemo } from "react"

const getTranslationKey = (type: CustomFieldType): string => {
  switch (type) {
    case "number":
      return "fields.number.label"
    case "date":
      return "fields.date.label"
    case "datetime":
      return "fields.datetime.label"
    case "boolean":
      return "fields.boolean.label"
    case "longText":
      return "fields.longText.label"
    default:
      return "fields.shortText.label"
  }
}

export default function CustomFieldTypeLabel({
  type,
}: {
  type: CustomFieldType
}) {
  const t = useTranslations()
  const label = useMemo(() => t(getTranslationKey(type)), [t, type])

  return <div>{label}</div>
}
